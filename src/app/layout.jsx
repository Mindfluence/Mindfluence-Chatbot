import { Inter } from 'next/font/google';
import ClientLayout from './client-layout';
import '../styles/globals.css'; // Pfad korrigiert zum tatsächlichen Speicherort

// Font für die gesamte Anwendung laden
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

// Metadata-Export
export const metadata = {
  title: 'Mindfluence Chatbot',
  description: 'Ein intelligenter Chatbot für Mindfluence',
};

// Viewport-Konfiguration
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="de" className={inter.variable} suppressHydrationWarning>
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}