// Envoie une notification au propriétaire du site.
// Implémentation minimale : journalise simplement le message côté serveur.
export async function notifyOwner(input: {
  title: string;
  content: string;
}): Promise<boolean> {
  console.log(`[notification] ${input.title}: ${input.content}`);
  return true;
}
