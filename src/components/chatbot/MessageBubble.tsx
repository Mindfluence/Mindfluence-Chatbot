import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import ReactMarkdown from 'react-markdown';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Button } from '../ui/Button';

export interface ActionButton {
  label: string;
  href: string;
}

export interface MessageProps {
  id: string;
  content: string;
  timestamp: Date;
  isUser: boolean;
  isLoading?: boolean;
  userName?: string;
  botName?: string;
  botStatus?: string;
  actions?: ActionButton[];
}

export const MessageBubble: React.FC<MessageProps> = ({
  content,
  timestamp,
  isUser,
  isLoading = false,
  userName = 'Du',
  botName = 'Assistent',
  botStatus,
  actions = [],
}) => {
  // Berechne den relativen Zeitstempel (z.B. "vor 5 Minuten")
  const relativeTime = formatDistanceToNow(new Date(timestamp), {
    addSuffix: true,
    locale: de,
  });

  // Framer Motion Animation Varianten
  const bubbleVariants = {
    hidden: { 
      opacity: 0, 
      y: 10,
      scale: 0.95 
    },
    visible: { 
      opacity: 1, 
      y: 0,
      scale: 1,
      transition: { 
        type: "spring", 
        stiffness: 400, 
        damping: 25,
        duration: 0.3 
      } 
    }
  };

  // Animationen für Status-Indikator
  const statusVariants = {
    hidden: { opacity: 0, height: 0 },
    visible: { 
      opacity: 1, 
      height: 'auto',
      transition: { duration: 0.2, delay: 0.1 }
    }
  };

  return (
    <motion.div
      className={`flex w-full ${
        isUser ? 'justify-end' : 'justify-start'
      } mb-4`}
      initial="hidden"
      animate="visible"
      variants={bubbleVariants}
    >
      <motion.div
        className={`max-w-[80%] md:max-w-[70%] rounded-lg px-4 py-3 shadow-sm ${
          isUser
            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-br-none'
            : 'bg-gradient-to-r from-gray-100 to-white dark:from-gray-800 dark:to-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-none'
        } ${isLoading ? 'animate-pulse' : ''}`}
        whileHover={{ scale: 1.01 }}
      >
        <div className="flex items-center mb-1">
          <span className="font-semibold text-sm">
            {isUser ? userName : botName}
          </span>
          <span className="ml-2 text-xs opacity-70">{relativeTime}</span>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none">
          {isLoading ? (
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              <div className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: '600ms' }}></div>
              
              {botStatus && (
                <motion.div 
                  className="ml-3 text-xs italic opacity-70"
                  initial="hidden"
                  animate="visible"
                  variants={statusVariants}
                >
                  {botStatus}
                </motion.div>
              )}
            </div>
          ) : (
            <div className="break-words whitespace-pre-wrap">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}
        </div>

        {!isUser && actions && actions.length > 0 && (
          <motion.div 
            className="mt-3 flex flex-wrap gap-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            {actions.map((action, index) => (
              <Link href={action.href} key={index} passHref>
                <Button
                  size="sm"
                  variant="outline"
                  className="transition-all hover:bg-blue-100 dark:hover:bg-blue-900/30"
                >
                  {action.label}
                </Button>
              </Link>
            ))}
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default MessageBubble;