import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

const cardVariants = cva(
  'rounded-lg border bg-white dark:bg-gray-800 shadow-sm',
  {
    variants: {
      padding: {
        default: 'p-6',
        compact: 'p-4',
        none: 'p-0',
      },
      border: {
        default: 'border-gray-200 dark:border-gray-700',
        none: 'border-0',
        accent: 'border-blue-200 dark:border-blue-800',
      },
      elevation: {
        default: 'shadow-sm',
        elevated: 'shadow-md',
        high: 'shadow-lg',
        none: 'shadow-none',
      },
    },
    defaultVariants: {
      padding: 'default',
      border: 'default',
      elevation: 'default',
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, padding, border, elevation, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cardVariants({ padding, border, elevation, className })}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

// Additional Card subcomponents
const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={`flex flex-col space-y-1.5 p-6 pb-2 ${className || ''}`}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={`text-lg font-semibold leading-none tracking-tight ${className || ''}`}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={`text-sm text-gray-500 dark:text-gray-400 ${className || ''}`}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={`p-6 pt-0 ${className || ''}`} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={`flex items-center p-6 pt-0 ${className || ''}`}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };