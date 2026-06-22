import './globals.css';
export const metadata = { title: 'MAMV-Guard', description: 'General AI Output Verifier powered by MAMV' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body><main className="mx-auto max-w-6xl p-6">{children}</main></body></html>; }
