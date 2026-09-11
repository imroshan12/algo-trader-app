import { classifyToken } from './token';

describe('classifyToken', () => {
  it('recognises fine-grained tokens', () => {
    expect(classifyToken('github_pat_11ABCDEF')).toBe('fine-grained');
  });
  it('flags classic tokens, which reach every repository', () => {
    expect(classifyToken('ghp_abcdef')).toBe('classic');
  });
  it('ignores surrounding whitespace from a paste', () => {
    expect(classifyToken('  github_pat_x \n')).toBe('fine-grained');
    expect(classifyToken('   ')).toBe('empty');
  });
  it('does not guess about anything else', () => {
    expect(classifyToken('hello')).toBe('unknown');
  });
});
