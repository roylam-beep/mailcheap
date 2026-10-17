import { Geist, Geist_Mono } from "next/font/google";
import ProviderTheme from "@/components/ProviderTheme";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
// Mono is only used for code, DNS records, and the HTML editor. Skip the preload so it doesn't compete
// with the LCP text; next/font's size-adjusted fallback still keeps that text from shifting.
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], preload: false });

// The icon files in app/ apply wherever a page sets no icons; archive pages set the newsletter's logo.
// favicon.ico sits in public/ because Next links app/favicon.ico on every page, archive pages included.
export const metadata = {
	title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
	robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
	return (
		<html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
			<body className="min-h-dvh bg-background text-foreground">
				<ProviderTheme>
					<TooltipProvider delayDuration={200}>{children}</TooltipProvider>
				</ProviderTheme>
			</body>
		</html>
	);
}
