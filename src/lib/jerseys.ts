/** Name as printed across the shoulders: the surname, upper case. */
export function shirtName(name: string) {
  const parts = name.trim().split(/\s+/);
  const last = parts.length > 1 && ["ur", "de", "van", "du"].includes(parts[parts.length - 2].toLowerCase())
    ? parts.slice(-2).join(" ")
    : parts[parts.length - 1];
  return last.toUpperCase();
}
