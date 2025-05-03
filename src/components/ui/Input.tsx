import React, { forwardRef, InputHTMLAttributes, ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

// Styles für verschiedene Input-Varianten mit class-variance-authority
const inputStyles = cva(
  [
    'flex w-full rounded-md border text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'placeholder:text-gray-400 dark:placeholder:text-gray-500',
  ],
  {
    variants: {
      variant: {
        default: [
          'border-gray-300 bg-white text-gray-900',
          'dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100',
        ],
        error: [
          'border-red-500 bg-white text-gray-900',
          'dark:border-red-700 dark:bg-gray-800 dark:text-gray-100',
          'focus-visible:ring-red-500',
        ],
        success: [
          'border-green-500 bg-white text-gray-900',
          'dark:border-green-700 dark:bg-gray-800 dark:text-gray-100',
          'focus-visible:ring-green-500',
        ],
      },
      inputSize: { // Changed from 'size' to 'inputSize' to avoid conflict
        sm: 'h-8 px-3 py-1 text-xs',
        md: 'h-10 px-4 py-2',
        lg: 'h-12 px-4 py-2 text-base',
      },
      hasLeftIcon: {
        true: 'pl-10',
      },
      hasRightIcon: {
        true: 'pr-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'md', // Updated to match the new name
      hasLeftIcon: false,
      hasRightIcon: false,
    },
  }
);

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>, // Omit size from HTML attributes
    VariantProps<typeof inputStyles> {
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  label?: string;
  helperText?: string;
  error?: string;
  fullWidth?: boolean;
  containerClassName?: string;
  labelClassName?: string;
  helperTextClassName?: string;
  errorClassName?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      variant,
      inputSize, // Changed from 'size' to 'inputSize'
      hasLeftIcon,
      hasRightIcon,
      id,
      leftIcon,
      rightIcon,
      label,
      helperText,
      error,
      fullWidth = true,
      containerClassName,
      labelClassName,
      helperTextClassName,
      errorClassName,
      type = 'text',
      ...props
    },
    ref
  ) => {
    // Wenn ein Fehler vorhanden ist, setze die Variante auf 'error'
    const inputVariant = error ? 'error' : variant;
    const inputId = id || `input-${Math.random().toString(36).substring(2, 9)}`;
    
    return (
      <div className={`flex flex-col gap-1.5 ${fullWidth ? 'w-full' : ''} ${containerClassName || ''}`}>
        {label && (
          <label
            htmlFor={inputId}
            className={`text-sm font-medium text-gray-700 dark:text-gray-300 ${labelClassName || ''}`}
          >
            {label}
          </label>
        )}
        
        <div className="relative">
          {leftIcon && (
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500 dark:text-gray-400">
              {leftIcon}
            </div>
          )}
          
          <input
            id={inputId}
            ref={ref}
            type={type}
            className={inputStyles({
              variant: inputVariant,
              inputSize, // Updated to match the new name
              hasLeftIcon: !!leftIcon,
              hasRightIcon: !!rightIcon,
              className,
            })}
            aria-invalid={!!error}
            aria-describedby={
              error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined
            }
            {...props}
          />
          
          {rightIcon && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-500 dark:text-gray-400">
              {rightIcon}
            </div>
          )}
        </div>
        
        {error && (
          <p
            id={`${inputId}-error`}
            className={`text-xs text-red-600 dark:text-red-400 ${errorClassName || ''}`}
          >
            {error}
          </p>
        )}
        
        {!error && helperText && (
          <p
            id={`${inputId}-helper`}
            className={`text-xs text-gray-500 dark:text-gray-400 ${helperTextClassName || ''}`}
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export { Input };