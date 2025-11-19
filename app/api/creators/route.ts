import { createServerClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServerClient();
  
  const { data, error } = await supabase
    .from("creator_stats")
    .select("*")
    .order("total_followers", { ascending: false });

  if (error) {
    console.error("Error fetching creators:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

