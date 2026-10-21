import { describe, expect, it } from 'vitest';
import { parseKv3 } from '../scripts/lib/kv3.ts';

const HEADER =
  '<!-- kv3 encoding:text:version{e21c7f3c-8a33-41c5-9977-a76d3a32aa0d} format:generic:version{7412167c-06e9-4698-aff2-e63eb59037e7} -->\n';

describe('parseKv3', () => {
  it('parses nested objects, numbers, booleans and null', () => {
    const data = parseKv3(`${HEADER}{
      hero_haze =
      {
        m_HeroID = 13
        m_bDisabled = false
        m_flValue = -0.5
        m_none = null
      }
    }`);
    expect(data).toEqual({ hero_haze: { m_HeroID: 13, m_bDisabled: false, m_flValue: -0.5, m_none: null } });
  });

  it('drops type prefixes and keeps the inner value', () => {
    const data = parseKv3(`${HEADER}{
      m_strModel = resource_name:"models/haze.vmdl"
      m_scale = subclass:
      {
        _class = "scale_function_single_stat"
      }
    }`);
    expect(data).toEqual({ m_strModel: 'models/haze.vmdl', m_scale: { _class: 'scale_function_single_stat' } });
  });

  it('parses arrays with trailing commas and quoted keys', () => {
    const data = parseKv3(`${HEADER}{
      "weapon_alt+lmb" = [ 1, 2.5, "a", ]
      m_Range = [0, 0]
    }`);
    expect(data).toEqual({ 'weapon_alt+lmb': [1, 2.5, 'a'], m_Range: [0, 0] });
  });

  it('handles string escapes, multi-line strings and comments', () => {
    const data = parseKv3(`${HEADER}{
      // line comment
      a = "say \\"hi\\""
      /* block
         comment */
      b = """
line1
line2
"""
    }`);
    expect(data).toEqual({ a: 'say "hi"', b: 'line1\nline2' });
  });

  it('reports the line of a syntax error', () => {
    expect(() => parseKv3(`${HEADER}{\n a = 1\n b 2\n}`)).toThrow(/line 4/);
  });
});
