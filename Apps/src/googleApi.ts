/**
 * Google Drive and Sheets API helper module
 */

export function getFormattedDateTime(dateTimeStr?: string): string {
  if (dateTimeStr) return dateTimeStr;
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function base64ToBlob(base64Data: string, contentType = "image/jpeg"): Blob {
  const sliceSize = 512;
  const byteCharacters = atob(base64Data.split(",")[1] || base64Data);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }

  return new Blob(byteArrays, { type: contentType });
}

export async function uploadImageToDrive(
  accessToken: string,
  fileName: string,
  base64Data: string
): Promise<string> {
  const blob = base64ToBlob(base64Data, "image/jpeg");
  
  const metadata = {
    name: fileName,
    mimeType: "image/jpeg",
  };
  
  const boundary = "314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;
  
  const reader = new FileReader();
  const arrayBufferPromise = new Promise<ArrayBuffer>((resolve, reject) => {
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
  });
  reader.readAsArrayBuffer(blob);
  const mediaBuffer = await arrayBufferPromise;
  
  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const mediaPartHeader = `\r\n--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Transfer-Encoding: base64\r\n\r\n`;
  
  const enc = new TextEncoder();
  const metadataBytes = enc.encode(metadataPart);
  const mediaHeaderBytes = enc.encode(mediaPartHeader);
  const closeBytes = enc.encode(closeDelimiter);
  
  const base64Raw = base64Data.split(",")[1] || base64Data;
  const mediaBase64Bytes = enc.encode(base64Raw);
  
  const totalLength = metadataBytes.length + mediaHeaderBytes.length + mediaBase64Bytes.length + closeBytes.length;
  const multipartBody = new Uint8Array(totalLength);
  
  let position = 0;
  multipartBody.set(metadataBytes, position); position += metadataBytes.length;
  multipartBody.set(mediaHeaderBytes, position); position += mediaHeaderBytes.length;
  multipartBody.set(mediaBase64Bytes, position); position += mediaBase64Bytes.length;
  multipartBody.set(closeBytes, position);
  
  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Drive Upload Error: ${errText}`);
  }
  
  const responseData = await response.json();
  const fileId = responseData.id;
  
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "reader",
        type: "anyone",
      }),
    });
  } catch (permError) {
    console.warn("Could not set anyone-readable permission, continuing...", permError);
  }
  
  return `https://drive.google.com/file/d/${fileId}/view`;
}

export async function getOrCreateSpreadsheet(accessToken: string): Promise<string> {
  const query = encodeURIComponent("name = 'Butcher Seafood Scale Records' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
  
  try {
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        console.log("Found existing spreadsheet:", searchData.files[0].id);
        return searchData.files[0].id;
      }
    }
  } catch (searchErr) {
    console.error("Search spreadsheet error:", searchErr);
  }
  
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        title: "Butcher Seafood Scale Records",
      },
    }),
  });
  
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Create Spreadsheet Error: ${errText}`);
  }
  
  const sheetData = await createRes.json();
  const spreadsheetId = sheetData.spreadsheetId;
  
  await appendRowToSheet(accessToken, spreadsheetId, [
    "Thời gian",
    "Tên Butcher",
    "Mã PIN",
    "Mặt hàng",
    "Số kg",
    "Đường dẫn ảnh",
    "Trạng thái",
  ]);
  
  return spreadsheetId;
}

export async function appendRowToSheet(
  accessToken: string,
  spreadsheetId: string,
  values: (string | number | null)[]
): Promise<void> {
  const range = "Sheet1!A1";
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
  
  const response = await fetch(appendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: [values],
    }),
  });
  
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sheets Append Error: ${errText}`);
  }
}
