// Characters chosen to avoid look-alikes (0/O, 1/I/L) so a code is easy
// to read aloud or type on a phone.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoundCode(length = 5): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}
