import React from 'react';

interface ResizableCardWrapperProps {
  duration: number;
  children: React.ReactNode;
  gap?: number;
}

const ResizableCardWrapper: React.FC<ResizableCardWrapperProps> = ({
  duration = 1,
  children,
  gap = 12,
}) => (
  <div
    className="relative z-10"
    style={{ width: `calc(100% * ${duration} + ${(duration - 1) * gap}px)` }}
  >
    {children}
  </div>
);

export default ResizableCardWrapper;
