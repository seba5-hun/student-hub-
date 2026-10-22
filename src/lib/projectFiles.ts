// Documents published in a project: the file stays in the Google Drive of who publishes it (their
// space, their control); the project keeps only its link and with whom it is shared. With the
// "drive.file" permission MYND can share only the files it created (uploaded here or in the Archivio).
import { DriveSharing, Member, Resource } from './projects';
import { DriveNotConnectedError, projectFolderPath, removeFilePermission, shareFileWithAnyone, shareFileWithEmail, uploadToDriveFolder } from './googleDrive';

export type ShareMode = 'progetto' | 'link';

// The emails that should see the documents of `me`: everyone else in the project.
export function audience(members: Member[], me: string): string[] {
  return [...new Set(members.filter(m => m.user_id !== me && m.email).map(m => m.email!.toLowerCase()))];
}

// Who joined or left since the document was shared (only for "persone del progetto").
export function sharingGap(r: Resource, members: Member[], me: string): { add: string[]; remove: { email: string; id: string }[] } {
  if (!r.drive_id || r.sharing?.mode !== 'progetto') return { add: [], remove: [] };
  const want = audience(members, me);
  const have = r.sharing.perms || [];
  return { add: want.filter(e => !have.some(h => h.email === e)), remove: have.filter(h => !want.includes(h.email)) };
}

export interface ShareOutcome { sharing: DriveSharing; failed: string[] }

// Shares a Drive file (already created by MYND) as chosen.
export async function shareDocument(fileId: string, mode: ShareMode, members: Member[], me: string): Promise<ShareOutcome> {
  if (mode === 'link') return { sharing: { mode, anyone_id: await shareFileWithAnyone(fileId), perms: [] }, failed: [] };
  const perms: { email: string; id: string }[] = [];
  const failed: string[] = [];
  for (const email of audience(members, me)) {
    try { perms.push({ email, id: await shareFileWithEmail(fileId, email) }); }
    catch (err) { if (err instanceof DriveNotConnectedError) throw err; failed.push(email); }
  }
  return { sharing: { mode, perms }, failed };
}

// Uploads a file to "Student Hub/Progetti/<project>" and shares it.
export async function uploadAndShare(file: File, projectName: string, mode: ShareMode, members: Member[], me: string) {
  const ref = await uploadToDriveFolder(file, projectFolderPath(projectName));
  const outcome = await shareDocument(ref.id, mode, members, me);
  return { ref, ...outcome };
}

// Brings the sharing in step with who is in the project now.
export async function syncSharing(r: Resource, members: Member[], me: string): Promise<ShareOutcome> {
  const { add, remove } = sharingGap(r, members, me);
  const perms = (r.sharing?.perms || []).filter(p => !remove.some(x => x.id === p.id));
  const failed: string[] = [];
  for (const p of remove) await removeFilePermission(r.drive_id!, p.id);
  for (const email of add) {
    try { perms.push({ email, id: await shareFileWithEmail(r.drive_id!, email) }); }
    catch (err) { if (err instanceof DriveNotConnectedError) throw err; failed.push(email); }
  }
  return { sharing: { ...r.sharing, mode: 'progetto', perms }, failed };
}

// Stops sharing a document taken out of the project (it stays in the Drive of who published it).
export async function unshareDocument(r: Resource): Promise<void> {
  if (!r.drive_id) return;
  for (const p of r.sharing?.perms || []) await removeFilePermission(r.drive_id, p.id);
  if (r.sharing?.anyone_id) await removeFilePermission(r.drive_id, r.sharing.anyone_id);
}

export function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} GB`;
}

export const isDriveUrl = (url: string | null | undefined) => !!url && /^https:\/\/(drive|docs)\.google\.com\//i.test(url);
