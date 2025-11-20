"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
}

export default function BrowsePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/categories");
      if (response.ok) {
        const categoriesData = await response.json();
        setCategories(categoriesData);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen pt-24 pb-8 px-2 md:px-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-medium mb-16 text-center">
          Browse Categories
        </h1>
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin"></div>
          </div>
        ) : categories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No categories available</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {categories.map((category) => (
              <Link key={category.id} href={`/browse/${category.slug}`}>
                <Card className="cursor-pointer h-full relative overflow-hidden aspect-square bg-muted/30">
                  {category.imageUrl ? (
                    <div className="absolute inset-0 w-full h-full flex items-center justify-center mb-8">
                      <img
                        src={category.imageUrl}
                        alt={category.name}
                        className="w-2/3 h-2/3 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="absolute inset-0 w-full h-full flex items-center justify-center mb-8">
                      <div className="w-2/3 h-2/3 bg-muted rounded-full" />
                    </div>
                  )}
                  <div className="relative h-full flex flex-col justify-end p-6 z-10">
                    <h3 className="font-medium text-xl mb-1">
                      {category.name}
                    </h3>
                    {category.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {category.description}
                      </p>
                    )}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
