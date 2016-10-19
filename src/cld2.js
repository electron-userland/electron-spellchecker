const cld = require('@paulcbetts/cld');

export function detect(text) {
  console.log("CALLING DETECT");

  return new Promise((res,rej) => {
    console.log("RETURNING PROMISE");
    cld.detect(text, (err, result) => {
      console.log("DETECTED");
      if (err) { rej(new Error(err.message)); return; }
      console.log("NOT INVALID");
      if (!result.reliable || result.languages[0].percent < 85) {
        rej(new Error('Not enough reliable text'));
        return;
      }

      console.log(`RETURNING RESULT ${result.languages[0].code}`);
      res(result.languages[0].code);
    });
  });
}
