import { describe, it, expect } from 'vitest';
import sodium from 'libsodium-wrappers';
import { sealedBoxEncryptToBase64 } from '@/utils/sealedBox';

// 关键：GitHub 服务器用 libsodium crypto_box_seal_open 解封，
// 测试必须验证与 libsodium 的互操作性（而非自解封）。
describe('sealedBoxEncryptToBase64（GitHub Actions Secrets 加密）', () => {
  it('libsodium（GitHub 服务器等效）能解封我们的密封结果', async () => {
    await sodium.ready;
    const recipient = sodium.crypto_box_keypair();
    const message = 'AT_hello-secret-value';

    const encrypted = await sealedBoxEncryptToBase64(
      message,
      sodium.to_base64(recipient.publicKey, sodium.base64_variants.ORIGINAL),
    );

    const sealed = sodium.from_base64(encrypted, sodium.base64_variants.ORIGINAL);
    const opened = sodium.crypto_box_seal_open(sealed, recipient.publicKey, recipient.privateKey);
    expect(sodium.to_string(opened)).toBe(message);
  });

  it('非 ASCII 内容（curl_bash 含引号/中文）可正确往返', async () => {
    await sodium.ready;
    const recipient = sodium.crypto_box_keypair();
    const message = "curl 'https://weread.qq.com/web/book/read' -H 'user-agent: 测试' -b 'wr_vid=123'";

    const encrypted = await sealedBoxEncryptToBase64(
      message,
      sodium.to_base64(recipient.publicKey, sodium.base64_variants.ORIGINAL),
    );

    const sealed = sodium.from_base64(encrypted, sodium.base64_variants.ORIGINAL);
    const opened = sodium.crypto_box_seal_open(sealed, recipient.publicKey, recipient.privateKey);
    expect(sodium.to_string(opened)).toBe(message);
  });

  it('不同消息产生不同密文', async () => {
    await sodium.ready;
    const recipient = sodium.crypto_box_keypair();
    const pk = sodium.to_base64(recipient.publicKey, sodium.base64_variants.ORIGINAL);
    const a = await sealedBoxEncryptToBase64('secret-1', pk);
    const b = await sealedBoxEncryptToBase64('secret-2', pk);
    expect(a).not.toBe(b);
  });

  it('输出为标准 base64（无换行）', async () => {
    await sodium.ready;
    const recipient = sodium.crypto_box_keypair();
    const encrypted = await sealedBoxEncryptToBase64(
      'x',
      sodium.to_base64(recipient.publicKey, sodium.base64_variants.ORIGINAL),
    );
    expect(/^[A-Za-z0-9+/=]+$/.test(encrypted)).toBe(true);
  });
});
