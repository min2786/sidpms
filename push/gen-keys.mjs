// 내 컴퓨터에서만 실행하세요:  node push/gen-keys.mjs
// 출력된 PUBLIC 키는 config.js에, PRIVATE 키는 GitHub Secrets(VAPID_PRIVATE)에만 넣고 다른 곳에 붙여넣지 마세요.
import {generateKeyPairSync} from "node:crypto";
const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"P-256"});
const pub=publicKey.export({format:"jwk"}),prv=privateKey.export({format:"jwk"});
const b=x=>x;
const pubRaw=Buffer.concat([Buffer.from([4]),Buffer.from(pub.x,"base64url"),Buffer.from(pub.y,"base64url")]).toString("base64url");
console.log("PUBLIC  (config.js에 넣기):\n"+pubRaw+"\n\nPRIVATE (GitHub Secret VAPID_PRIVATE에만 넣기, 공유 금지):\n"+prv.d);
