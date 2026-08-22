import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';
import { sealedBoxEncrypt } from '@/utils/sealedBox';

describe('sealedBoxEncrypt（GitHub Actions Secrets 加密）', () => {
  it('密封盒可用接收方私钥解封（roundtrip）', () => {
    const recipient = nacl.box.keyPair();
    const message = 'AT_hello-secret-value';

    const sealed = sealedBoxEncrypt(decodeUTF8(message), encodeBase64(recipient.publicKey));

    // 格式：ephemeral 公钥(32) + nonce(24) + 密文
    expect(sealed.length).toBeGreaterThan(32 + 24);
    const ephemeralPk = sealed.subarray(0, 32);
    const nonce = sealed.subarray(32, 56);
    const cipher = sealed.subarray(56);

    const opened = nacl.box.open(cipher, nonce, ephemeralPk, recipient.secretKey);
    expect(opened).not.toBeNull();
    expect(encodeUTF8(opened!)).toBe(message);
  });

  it('不同消息产生不同密文', () => {
    const recipient = nacl.box.keyPair();
    const pk = encodeBase64(recipient.publicKey);
    const a = sealedBoxEncrypt(decodeUTF8('secret-1'), pk);
    const b = sealedBoxEncrypt(decodeUTF8('secret-2'), pk);
    expect(encodeBase64(a)).not.toBe(encodeBase64(b));
  });

  it('返回 base64 字符串且不含换行', () => {
    const recipient = nacl.box.keyPair();
    const sealed = sealedBoxEncrypt(decodeUTF8('x'), encodeBase64(recipient.publicKey));
    const b64 = encodeBase64(sealed);
    expect(/^[A-Za-z0-9+/=]+$/.test(b64)).toBe(true);
  });
});
