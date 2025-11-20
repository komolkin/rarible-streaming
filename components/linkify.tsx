import React from "react";

interface LinkifyProps {
  text: string;
  className?: string;
  linkClassName?: string;
}

export const Linkify: React.FC<LinkifyProps> = ({ text, className, linkClassName }) => {
  if (!text) return null;

  // URL regex that matches http/https protocols
  // Captures the URL to split the string
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  const parts = text.split(urlRegex);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (part.match(urlRegex)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className={`hover:underline break-words ${linkClassName || "text-primary"}`}
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
};

