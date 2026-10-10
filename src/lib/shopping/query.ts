export function shopQuery(mandateQuery: string, argument: string): string {
  const typed = argument.trim();
  return typed.length > 0 ? typed : mandateQuery.trim();
}
