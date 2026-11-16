type AppDictation = {
  start: (options: { language: string }) => Promise<{ text: string }>;
  stop: () => Promise<void>;
};

// Older TestFlight builds keep using the existing input controls.
export function nativeDictation(): AppDictation | undefined {
  const cap = (window as { Capacitor?: { Plugins?: { AppDictation?: AppDictation } } }).Capacitor;
  return cap?.Plugins?.AppDictation;
}
