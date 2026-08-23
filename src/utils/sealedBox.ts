// GitHub Actions Secrets 的加密要求：
// 使用 libsodium 的 crypto_box_seal（curve25519-xsalsa20-poly1305 密封盒）对
// secret 加密后以 base64 提交。公钥来自
// GET /repos/{owner}/{repo}/actions/secrets/public-key。
//
// 注意：sealed box 的 nonce 由 libsodium 内部从临时公钥与接收方公钥派生
// （blake2b），不能用随机 nonce 手动拼装（tweetnacl 方式），否则 GitHub
// 服务器端 crypto_box_seal_open 解封失败，报 "improperly encrypted secret"。

import sodium from 'libsodium-wrappers';

export async function sealedBoxEncryptToBase64(message: string, recipientPublicKeyBase64: string): Promise<string> {
  await sodium.ready;
  // GitHub 公钥为标准 base64（可能含 +/ 与 = 填充），必须显式用 ORIGINAL 变体
  const recipientPublicKey = sodium.from_base64(recipientPublicKeyBase64, sodium.base64_variants.ORIGINAL);
  const sealed = sodium.crypto_box_seal(sodium.from_string(message), recipientPublicKey);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}
