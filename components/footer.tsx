import Link from "next/link"

export function Footer() {
  return (
    <footer className="border-t border-border mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-sm text-muted-foreground">
            <p>© {new Date().getFullYear()} Rarible Streaming. All rights reserved.</p>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <Link 
              href="/browse" 
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Browse
            </Link>
            <Link 
              href="/create" 
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Create Stream
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}

