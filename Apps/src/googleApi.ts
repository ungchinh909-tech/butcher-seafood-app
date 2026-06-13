/**
 * Google Drive and Sheets API helper module
 */

// Helper to format date in Vietnam time (captured timezone) or standard local string
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

// Helper to convert base64 (e.g. data:image/jpeg;base64,...) to Blob
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

// Uploads a base64 image file to Google Drive and makes it readable by anyone with the link
export async function uploadImageToDrive(
  accessToken: string,
  fileName: string,
  base64Data: string
): Promise<string> {
  const blob = base64ToBlob(base64Data, "image/jpeg");
  
  // Create multipart payload body for Drive v3 api
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
  
  // Convert binary media directly or just convert metadata in text, join them
  // A clean standard way with Blob is:
  const enc = new TextEncoder();
  const metadataBytes = enc.encode(metadataPart);
  const mediaHeaderBytes = enc.encode(mediaPartHeader);
  const closeBytes = enc.encode(closeDelimiter);
  
  // Read base64 raw string
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
  
  // 2. Set file permissions so anyone with the link can view it (ideal for Google Sheets links)
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
  
  // Return standard Drive shareable link
  return `https://drive.google.com/file/d/${fileId}/view`;
}

// Creates or locates a Google Sheet named "Butcher Seafood Scale Records"
export async function getOrCreateSpreadsheet(accessToken: string): Promise<string> {
  // 1. Search for existing spreadsheet in Drive first
  const query = encodeURIComponent("name = 'Butcher Seafood Scale Records' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;
  
  try {
    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.files && searchData.files.length > 0) {
        console.log("Tìm thấy bảng tính sẵn có:", searchData.files[0].id);
        return searchData.files[0].id; // Re-use existing sheet
      }
    }
  } catch (searchErr) {
    console.error("Search spreadsheet error:", searchErr);
  }
  
  // 2. Create a new Google Sheet
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
  
  // 3. Initialize head rows
  await appendRowToSheet(accessToken, spreadsheetId, [
    "Thời gian",
    "Mặt hàng",
    "Số kg (từ AI)",
    "Đường dẫn ảnh",
    "Đã đối chiếu"
  ]);
  
  return spreadsheetId;
}

// Appends a single row of values to the specified Spreadsheet ID
export async function appendRowToSheet(
  accessToken: string,
  spreadsheetId: string,
  values: (string | number | null)[]
): Promise<void> {
  const range = "Sheet1!A1"; // Appending will auto-scan table and append after the last row
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
