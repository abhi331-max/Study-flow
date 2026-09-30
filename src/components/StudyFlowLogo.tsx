import React from 'react';

interface StudyFlowLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  textColor?: string;
}

export const StudyFlowLogo: React.FC<StudyFlowLogoProps> = ({
  size = 32,
  className = '',
  showText = true,
  textColor = 'text-slate-900 dark:text-white'
}) => {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* 
        Signature StudyFlow Book Icon matching the reference:
        Two open pages angled upward with subtle perspective and crisp rounded corners.
        Left page: #2563EB (Royal blue)
        Right page: #60A5FA (Sky blue)
      */}
      <svg 
        width={size} 
        height={size} 
        viewBox="0 0 36 36" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-[0_1px_2px_rgba(37,99,235,0.2)]"
      >
        {/* Left Page (Deep Blue) */}
        <path 
          d="M17 7.2C11.8 6.7 5.8 9.3 3.8 11.2C3.3 11.7 3 12.5 3 13.4V26.2C3 27.6 4.3 28.6 5.6 28.2C7.4 27.6 12.2 26 17 26.9V7.2Z" 
          fill="#2563EB" 
        />
        {/* Right Page (Bright Sky Blue) */}
        <path 
          d="M19 7.2C24.2 6.7 30.2 9.3 32.2 11.2C32.7 11.7 33 12.5 33 13.4V26.2C33 27.6 31.7 28.6 30.4 28.2C28.6 27.6 23.8 26 19 26.9V7.2Z" 
          fill="#60A5FA" 
        />
        {/* Center Spine Crease */}
        <path 
          d="M17 7.2H19V26.9H17V7.2Z" 
          fill="#1D4ED8" 
        />
      </svg>

      {showText && (
        <span className={`font-display text-[25px] font-normal tracking-[-0.02em] leading-none ${textColor}`}>
          StudyFlow
        </span>
      )}
    </div>
  );
};
