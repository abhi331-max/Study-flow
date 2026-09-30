import React, { useState, useEffect } from "react";
import { Video as VideoIcon, Play } from "lucide-react";
import { extractYouTubeVideoId, getYouTubeThumbnailUrl, getFallbackQualityUrl } from "../utils.ts";

export interface YouTubeThumbnailProps {
  videoId?: string | null;
  thumbnailUrl?: string | null;
  title?: string;
  subjectName?: string;
  subjectColor?: string;
  className?: string;
  showPlayOverlay?: boolean;
  aspectRatioClass?: string;
  onClick?: () => void;
  roundedClass?: string;
  children?: React.ReactNode;
}

export const YouTubeThumbnail: React.FC<YouTubeThumbnailProps> = ({
  videoId,
  thumbnailUrl,
  title = "Video Lecture",
  subjectName,
  subjectColor = "#2563eb",
  className = "",
  showPlayOverlay = false,
  aspectRatioClass = "aspect-video",
  onClick,
  roundedClass = "rounded-xl",
  children
}) => {
  const resolvedVideoId = extractYouTubeVideoId(videoId, thumbnailUrl);
  const initialUrl = getYouTubeThumbnailUrl(resolvedVideoId, thumbnailUrl);

  const [currentSrc, setCurrentSrc] = useState<string | null>(initialUrl);
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  useEffect(() => {
    const nextUrl = getYouTubeThumbnailUrl(resolvedVideoId, thumbnailUrl);
    setCurrentSrc(nextUrl);
    setImgFailed(!nextUrl);
    setIsLoaded(false);
  }, [videoId, thumbnailUrl, resolvedVideoId]);

  const handleImageError = () => {
    if (!currentSrc || !resolvedVideoId) {
      setImgFailed(true);
      return;
    }

    const fallbackUrl = getFallbackQualityUrl(currentSrc, resolvedVideoId);
    if (fallbackUrl && fallbackUrl !== currentSrc) {
      setCurrentSrc(fallbackUrl);
    } else {
      setImgFailed(true);
    }
  };

  return (
    <div
      onClick={onClick}
      className={`relative ${aspectRatioClass} w-full bg-slate-950 overflow-hidden ${roundedClass} ${
        onClick ? "cursor-pointer group select-none" : ""
      } ${className}`}
      title={title}
    >
      {currentSrc && !imgFailed ? (
        <>
          <img
            src={currentSrc}
            alt={title}
            onError={handleImageError}
            onLoad={() => setIsLoaded(true)}
            className={`w-full h-full object-cover transition-transform duration-300 ease-out ${
              onClick ? "group-hover:scale-105" : ""
            } ${isLoaded ? "opacity-100" : "opacity-80"}`}
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
        </>
      ) : (
        <div
          className="w-full h-full flex flex-col items-center justify-center p-3 text-center text-white relative"
          style={{
            background: `linear-gradient(135deg, ${subjectColor}dd 0%, #090d16 100%)`
          }}
        >
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center mb-1.5 border border-white/20">
            <VideoIcon className="w-5 h-5 text-white" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/95 line-clamp-1 max-w-[90%]">
            {subjectName || "StudyFlow Video Lecture"}
          </span>
          <span className="text-[9px] text-white/70 line-clamp-1 max-w-[90%] mt-0.5">
            {title}
          </span>
        </div>
      )}

      {showPlayOverlay && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors pointer-events-none">
          <div className="w-11 h-11 rounded-full bg-slate-950/80 text-white flex items-center justify-center shadow-lg transform transition-transform duration-200 group-hover:scale-110 group-hover:bg-blue-600 backdrop-blur-xs border border-white/20">
            <Play className="w-5 h-5 fill-current ml-0.5 text-white" />
          </div>
        </div>
      )}

      {children}
    </div>
  );
};
