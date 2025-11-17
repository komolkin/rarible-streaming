import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { normalizeToAddress, isEnsName } from "@/lib/ens";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const walletInput = searchParams.get("wallet");

    if (!walletInput) {
      return NextResponse.json(
        { error: "Wallet address or ENS name required" },
        { status: 400 }
      );
    }

    // Resolve ENS name to address if needed
    let walletAddress: string | null = null;
    if (isEnsName(walletInput)) {
      walletAddress = await normalizeToAddress(walletInput);
      if (!walletAddress) {
        return NextResponse.json(
          { error: "ENS name could not be resolved" },
          { status: 400 }
        );
      }
    } else {
      // Validate wallet address format (basic check)
      if (typeof walletInput !== "string" || walletInput.length < 10) {
        return NextResponse.json(
          { error: "Invalid wallet address format" },
          { status: 400 }
        );
      }
      walletAddress = walletInput;
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.walletAddress, walletAddress.toLowerCase()));

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error: any) {
    console.error("Error fetching profile:", error);
    const errorMessage = error?.message || "Failed to fetch profile";
    const errorDetails =
      process.env.NODE_ENV === "development" ? error?.stack : undefined;
    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, username, displayName, bio, email, avatarUrl } =
      body;

    // Normalize wallet address to lowercase for consistency
    const normalizedWalletAddress = walletAddress?.toLowerCase();

    if (!normalizedWalletAddress) {
      return NextResponse.json(
        { error: "Wallet address required" },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && email.trim() && !emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Convert empty strings to null for optional fields
    const updateData = {
      username: username && username.trim() ? username.trim() : null,
      displayName:
        displayName && displayName.trim() ? displayName.trim() : null,
      bio: bio && bio.trim() ? bio.trim() : null,
      email: email && email.trim() ? email.trim().toLowerCase() : null,
      avatarUrl: avatarUrl && avatarUrl.trim() ? avatarUrl.trim() : null,
      updatedAt: new Date(),
    };

    // Check if username is already taken by another user (not the current user)
    if (updateData.username) {
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, updateData.username))
        .limit(1);

      // Only block if username exists AND belongs to a different wallet address
      if (existingUser) {
        const existingWallet = existingUser.walletAddress?.toLowerCase() || "";
        const currentWallet = normalizedWalletAddress.toLowerCase();

        if (existingWallet !== currentWallet) {
          return NextResponse.json(
            { error: "Username is already taken" },
            { status: 400 }
          );
        }
        // If it's the same user, allow them to keep/update their username
      }
    }

    const [user] = await db
      .insert(users)
      .values({
        walletAddress: normalizedWalletAddress,
        username: updateData.username,
        displayName: updateData.displayName,
        bio: updateData.bio,
        email: updateData.email,
        avatarUrl: updateData.avatarUrl,
      })
      .onConflictDoUpdate({
        target: users.walletAddress,
        set: updateData,
      })
      .returning();

    return NextResponse.json(user);
  } catch (error: any) {
    console.error("Error creating/updating profile:", error);

    // Handle specific database errors
    let errorMessage = "Failed to create/update profile";
    let statusCode = 500;

    if (error?.code === "23505") {
      // Unique constraint violation
      if (error?.message?.includes("username")) {
        errorMessage = "Username is already taken";
        statusCode = 400;
      } else if (error?.message?.includes("wallet_address")) {
        errorMessage = "Wallet address already exists";
        statusCode = 400;
      } else {
        errorMessage = "A field with this value already exists";
        statusCode = 400;
      }
    } else if (error?.message) {
      errorMessage = error.message;
    }

    const errorDetails =
      process.env.NODE_ENV === "development" ? error?.stack : undefined;
    return NextResponse.json(
      {
        error: errorMessage,
        details: errorDetails,
      },
      { status: statusCode }
    );
  }
}
