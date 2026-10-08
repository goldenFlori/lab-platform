import { describe, expect, it } from 'vitest';
import { hashPassword, isValidPasswordHash, PASSWORD_ITERATIONS } from '../../src/shared/password';
import { generateStudentPassword, parseNameList, usernameBase } from '../../src/shared/student-names';

describe('usernames from names', () => {
  it.each([
    ['Arben Hoxha', 'arben.hoxha'],
    ['Ëndrit Çela', 'endrit.cela'],
    ['Ana Maria Kola', 'ana.kola'],
    ['  Xhoi  ', 'xhoi'],
    ["O'Neil Bregu-Doda", 'o.doda'],
    ['ÇAJUPI', 'cajupi'],
    ['123', 'student'],
  ])('%s → %s', (name, username) => {
    expect(usernameBase(name)).toBe(username);
  });
});

describe('generated passwords', () => {
  it('are 12 characters without look-alikes', () => {
    for (let i = 0; i < 200; i++) expect(generateStudentPassword()).toMatch(/^[abcdefghjkmnpqrstuvwxyz2-9]{12}$/);
  });

  it('do not repeat', () => {
    expect(new Set(Array.from({ length: 500 }, generateStudentPassword)).size).toBe(500);
  });
});

describe('class lists', () => {
  it('reads one name per line, ignoring blank lines and extra spaces', () => {
    expect(parseNameList('Arben Hoxha\n\n  Ëndrit   Çela \r\nMira Kola\n')).toEqual([
      'Arben Hoxha',
      'Ëndrit Çela',
      'Mira Kola',
    ]);
  });

  it('joins first and last name columns copied from Excel, without header, numbers or e-mails', () => {
    const pasted = [
      'Nr\tEmri\tMbiemri\tE-mail',
      '1\tArben\tHoxha\tarben@fshnstudent.info',
      '2\tMira\tKola\tmira@fshnstudent.info',
    ].join('\n');
    expect(parseNameList(pasted)).toEqual(['Arben Hoxha', 'Mira Kola']);
  });

  it('reads CSV with commas or semicolons and quoted fields', () => {
    expect(parseNameList('Emri,Mbiemri\n"Ana Maria",Kola\nBesa;Duka\n"Leka, i Ri"')).toEqual([
      'Ana Maria Kola',
      'Besa Duka',
      'Leka, i Ri',
    ]);
  });

  it('drops numbering written in front of a name', () => {
    expect(parseNameList('1. Arben Hoxha\n2) Mira Kola')).toEqual(['Arben Hoxha', 'Mira Kola']);
  });
});

describe('hashes from the browser', () => {
  it('accepts hashes made with today’s parameters', async () => {
    expect(isValidPasswordHash(await hashPassword('x'))).toBe(true);
  });

  it('refuses weaker or malformed hashes', async () => {
    expect(isValidPasswordHash(await hashPassword('x', 1000))).toBe(false);
    expect(isValidPasswordHash(`pbkdf2-sha256$${PASSWORD_ITERATIONS}$short$short`)).toBe(false);
    expect(isValidPasswordHash('plaintext')).toBe(false);
    expect(isValidPasswordHash(`pbkdf2-sha256$${PASSWORD_ITERATIONS}$!!!$???`)).toBe(false);
  });
});
