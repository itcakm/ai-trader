export default function Home() {
  return (
    <main 
      id="main-content" 
      className="flex min-h-screen flex-col items-center justify-center p-24"
      tabIndex={-1}
      aria-label="Main content"
    >
      <h1 className="text-4xl font-bold text-foreground">
        AI-Assisted Crypto Trading System
      </h1>
      <p className="mt-4 text-muted-foreground">
        Welcome to the trading platform
      </p>
    </main>
  );
}
