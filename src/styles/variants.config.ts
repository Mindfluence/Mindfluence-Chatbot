/**
 * UI-Komponentenvarianten
 * 
 * Diese Datei definiert die verschiedenen Varianten für UI-Komponenten
 * mit class-variance-authority (cva). Sie bietet ein typensicheres System
 * für Komponenten-Varianten, das mit Tailwind CSS funktioniert.
 */

import { cva, type VariantProps } from 'class-variance-authority';

// ============================
// Button-Varianten
// ============================

export const buttonVariants = cva(
  // Gemeinsame Basis-Klassen für alle Button-Varianten
  [
    'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500',
    'disabled:opacity-50 disabled:pointer-events-none',
  ],
  {
    variants: {
      // Button-Variante (Aussehen)
      variant: {
        // Primärer Button - für Hauptaktionen
        primary: [
          'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700',
          'dark:bg-primary-600 dark:hover:bg-primary-500 dark:active:bg-primary-400',
        ],
        // Sekundärer Button - für alternative Aktionen
        secondary: [
          'bg-secondary-500 text-white hover:bg-secondary-600 active:bg-secondary-700',
          'dark:bg-secondary-600 dark:hover:bg-secondary-500 dark:active:bg-secondary-400',
        ],
        // Outline Button - für weniger wichtige Aktionen
        outline: [
          'border border-neutral-300 bg-transparent text-neutral-900 hover:bg-neutral-100 active:bg-neutral-200',
          'dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800 dark:active:bg-neutral-700',
        ],
        // Ghost Button - für subtile Aktionen
        ghost: [
          'bg-transparent text-neutral-900 hover:bg-neutral-100 active:bg-neutral-200',
          'dark:text-neutral-100 dark:hover:bg-neutral-800 dark:active:bg-neutral-700',
        ],
        // Link Button - für Aktionen, die wie Links erscheinen sollen
        link: [
          'bg-transparent text-primary-500 hover:underline hover:text-primary-600 active:text-primary-700',
          'dark:text-primary-400 dark:hover:text-primary-300 dark:active:text-primary-200',
        ],
        // Destructive Button - für Lösch- oder gefährliche Aktionen
        destructive: [
          'bg-error-500 text-white hover:bg-error-600 active:bg-error-700',
          'dark:bg-error-600 dark:hover:bg-error-500 dark:active:bg-error-400',
        ],
        // Success Button - für erfolgreiche Aktionen oder Bestätigungen
        success: [
          'bg-success-500 text-white hover:bg-success-600 active:bg-success-700',
          'dark:bg-success-600 dark:hover:bg-success-500 dark:active:bg-success-400',
        ],
      },
      // Button-Größe
      size: {
        sm: 'h-8 px-3 py-1 text-xs',
        md: 'h-10 px-4 py-2',
        lg: 'h-12 px-6 py-3 text-base',
        icon: 'h-10 w-10 p-2',
      },
      // Button-Rundung
      rounded: {
        default: 'rounded-md',
        sm: 'rounded-sm',
        lg: 'rounded-lg',
        full: 'rounded-full',
        none: 'rounded-none',
      },
      // Volle Breite (100%)
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      rounded: 'default',
      fullWidth: false,
    },
  }
);

// Button-Varianten Typen
export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

// ============================
// Input-Varianten
// ============================

export const inputVariants = cva(
  // Gemeinsame Basis-Klassen für alle Input-Varianten
  [
    'flex w-full rounded-md border text-sm transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'placeholder:text-neutral-400 dark:placeholder:text-neutral-500',
  ],
  {
    variants: {
      // Input-Variante (Aussehen)
      variant: {
        // Standard-Input
        default: [
          'border-neutral-300 bg-white text-neutral-900',
          'dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100',
        ],
        // Input mit Fehlerzustand
        error: [
          'border-error-500 bg-white text-neutral-900',
          'dark:border-error-700 dark:bg-neutral-800 dark:text-neutral-100',
          'focus-visible:ring-error-500',
        ],
        // Input mit Erfolgszustand
        success: [
          'border-success-500 bg-white text-neutral-900',
          'dark:border-success-700 dark:bg-neutral-800 dark:text-neutral-100',
          'focus-visible:ring-success-500',
        ],
      },
      // Input-Größe
      size: {
        sm: 'h-8 px-3 py-1 text-xs',
        md: 'h-10 px-4 py-2',
        lg: 'h-12 px-4 py-2 text-base',
      },
      // Icon-Indikator rechts oder links
      hasLeftIcon: {
        true: 'pl-10',
      },
      hasRightIcon: {
        true: 'pr-10',
      },
      // Volle Breite (100%)
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      hasLeftIcon: false,
      hasRightIcon: false,
      fullWidth: true,
    },
  }
);

// Input-Varianten Typen
export type InputVariantProps = VariantProps<typeof inputVariants>;

// ============================
// Card-Varianten
// ============================

export const cardVariants = cva(
  // Gemeinsame Basis-Klassen für alle Card-Varianten
  'rounded-lg border shadow-sm',
  {
    variants: {
      // Card-Variante (Aussehen)
      variant: {
        // Standard-Card
        default: [
          'border-neutral-200 bg-white',
          'dark:border-neutral-700 dark:bg-neutral-800',
        ],
        // Card mit Akzentfarbe
        primary: [
          'border-primary-200 bg-primary-50',
          'dark:border-primary-800 dark:bg-primary-900',
        ],
        // Subtile Card
        ghost: [
          'border-transparent bg-neutral-50',
          'dark:bg-neutral-900',
        ],
      },
      // Card-Padding
      padding: {
        none: 'p-0',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
      },
      // Card-Schatten
      elevation: {
        none: 'shadow-none',
        sm: 'shadow-sm',
        md: 'shadow-md',
        lg: 'shadow-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
      elevation: 'sm',
    },
  }
);

// Card-Varianten Typen
export type CardVariantProps = VariantProps<typeof cardVariants>;

// ============================
// Badge-Varianten
// ============================

export const badgeVariants = cva(
  // Gemeinsame Basis-Klassen für alle Badge-Varianten
  'inline-flex items-center rounded-full font-medium transition-colors',
  {
    variants: {
      // Badge-Variante (Aussehen)
      variant: {
        // Standard-Badge
        default: [
          'bg-neutral-200 text-neutral-900',
          'dark:bg-neutral-700 dark:text-neutral-100',
        ],
        // Primärfarbiges Badge
        primary: [
          'bg-primary-100 text-primary-800',
          'dark:bg-primary-800 dark:text-primary-100',
        ],
        // Sekundärfarbiges Badge
        secondary: [
          'bg-secondary-100 text-secondary-800',
          'dark:bg-secondary-800 dark:text-secondary-100',
        ],
        // Erfolgs-Badge
        success: [
          'bg-success-100 text-success-800',
          'dark:bg-success-800 dark:text-success-100',
        ],
        // Warn-Badge
        warning: [
          'bg-warning-100 text-warning-800',
          'dark:bg-warning-800 dark:text-warning-100',
        ],
        // Fehler-Badge
        error: [
          'bg-error-100 text-error-800',
          'dark:bg-error-800 dark:text-error-100',
        ],
        // Outline-Badge
        outline: [
          'border border-neutral-300 bg-transparent text-neutral-900',
          'dark:border-neutral-600 dark:text-neutral-100',
        ],
      },
      // Badge-Größe
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-0.5 text-sm',
        lg: 'px-3 py-1 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

// Badge-Varianten Typen
export type BadgeVariantProps = VariantProps<typeof badgeVariants>;

// ============================
// Chat Bubble Varianten
// ============================

export const chatBubbleVariants = cva(
  // Gemeinsame Basis-Klassen für alle Chat-Bubble-Varianten
  'px-4 py-3 max-w-[80%] md:max-w-[70%] rounded-lg',
  {
    variants: {
      // Sender (Benutzer oder Bot)
      sender: {
        // Benutzer-Nachricht
        user: [
          'bg-chat-userBg text-chat-userText rounded-br-none',
          'dark:bg-primary-600 dark:text-white',
        ],
        // Bot-Nachricht
        bot: [
          'bg-chat-botBg text-chat-botText rounded-bl-none',
          'dark:bg-neutral-800 dark:text-neutral-100',
        ],
      },
      // Status (z.B. für Ladezustände)
      status: {
        default: '',
        loading: 'animate-pulse',
        error: 'bg-error-100 dark:bg-error-900',
      },
    },
    defaultVariants: {
      sender: 'user',
      status: 'default',
    },
  }
);

// Chat Bubble Varianten Typen
export type ChatBubbleVariantProps = VariantProps<typeof chatBubbleVariants>;

// ============================
// Toggle Varianten (für den Chat-Toggle-Button)
// ============================

export const toggleVariants = cva(
  // Gemeinsame Basis-Klassen für alle Toggle-Varianten
  'fixed z-50 rounded-full flex items-center justify-center shadow-md transition-transform',
  {
    variants: {
      // Toggle-Variante (Aussehen)
      variant: {
        // Standard-Toggle
        default: [
          'bg-primary-500 text-white hover:bg-primary-600',
          'dark:bg-primary-600 dark:hover:bg-primary-500',
        ],
        // Subtiler Toggle
        ghost: [
          'bg-white text-neutral-900 hover:bg-neutral-100',
          'dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700',
        ],
      },
      // Toggle-Größe
      size: {
        sm: 'h-10 w-10',
        md: 'h-12 w-12',
        lg: 'h-14 w-14',
      },
      // Toggle-Position
      position: {
        'bottom-right': 'bottom-4 right-4 md:bottom-6 md:right-6',
        'bottom-left': 'bottom-4 left-4 md:bottom-6 md:left-6',
        'top-right': 'top-4 right-4 md:top-6 md:right-6',
        'top-left': 'top-4 left-4 md:top-6 md:left-6',
      },
      // Toggle-Status
      status: {
        closed: '',
        open: 'rotate-45',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      position: 'bottom-right',
      status: 'closed',
    },
  }
);

// Toggle Varianten Typen
export type ToggleVariantProps = VariantProps<typeof toggleVariants>;

// ============================
// Chat Container Varianten
// ============================

export const chatContainerVariants = cva(
  // Gemeinsame Basis-Klassen für alle Chat-Container-Varianten
  'fixed z-40 transition-all overflow-hidden flex flex-col',
  {
    variants: {
      // Container-Variante (Aussehen)
      variant: {
        // Standard-Container
        default: [
          'bg-white border border-neutral-200 shadow-lg',
          'dark:bg-neutral-900 dark:border-neutral-700',
        ],
        // Container ohne Rand
        borderless: [
          'bg-white shadow-xl',
          'dark:bg-neutral-900',
        ],
      },
      // Container-Größe
      size: {
        sm: 'w-[300px] h-[400px]',
        md: 'w-[350px] h-[500px]',
        lg: 'w-[400px] h-[600px]',
        xl: 'w-[450px] h-[650px]',
        // Responsive-Größe (Vollbild auf Mobilgeräten)
        responsive: [
          'w-full h-[500px] md:w-[350px] md:h-[500px]',
          'bottom-0 left-0 right-0 md:bottom-auto md:left-auto md:right-auto',
        ],
      },
      // Container-Position
      position: {
        'bottom-right': 'bottom-20 right-4 md:bottom-24 md:right-6',
        'bottom-left': 'bottom-20 left-4 md:bottom-24 md:left-6',
        'top-right': 'top-20 right-4 md:top-24 md:right-6',
        'top-left': 'top-20 left-4 md:top-24 md:left-6',
      },
      // Container-Rundung
      rounded: {
        default: 'rounded-lg',
        sm: 'rounded-md',
        lg: 'rounded-xl',
        none: 'rounded-none',
      },
      // Container-Status
      status: {
        open: 'opacity-100 translate-y-0',
        closed: 'opacity-0 translate-y-8 pointer-events-none',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
      position: 'bottom-right',
      rounded: 'default',
      status: 'closed',
    },
  }
);

// Chat Container Varianten Typen
export type ChatContainerVariantProps = VariantProps<typeof chatContainerVariants>;