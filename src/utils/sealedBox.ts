// GitHub Actions Secrets 的加密要求：
// 使用 libsodium 的 crypto_box_seal（curve25519-xsalsa20-poly1305）对 secret 加密，
// 再以 base64 提交。公钥来自 GET /repos/{owner}/{repo}/actions/secrets/public-key。
//
// 密封盒构造（与 libsodium crypto_box_seal 一致）：
//   ephemeral 公钥(32B) || nonce(24B) || box(明文, nonce, 接收方公钥, ephemeral 私钥)

import nacl from 'tweetnacl';
import { decodeBase64, encodeBase64 } from 'tweetnacl-util';

export function sealedBoxEncrypt(message: Uint8Array, recipientPublicKeyBase64: string): Uint8Array {
  const recipientPublicKey = decodeBase64(recipientPublicKeyBase64);
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);

  const boxed = nacl.box(message, nonce, recipientPublicKey, ephemeral.secretKey);

  const sealed = new Uint8Array(ephemeral.publicKey.length + nonce.length + boxed.length);
  sealed.set(ephemeral.publicKey, 0);
  sealed.set(nonce, ephemeral.publicKey.length);
  sealed.set(boxed, ephemeral.publicKey.length + nonce.length);
  return sealed;
}

export function sealedBoxEncryptToBase64(message: Uint8Array, recipientPublicKeyBase64: string): string {
  return encodeBase64(sealedBoxEncrypt(message, recipientPublicKeyBase64));
}
