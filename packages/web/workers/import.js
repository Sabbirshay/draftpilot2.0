/* Runs in an isolated worker. No binary file is uploaded to the server. */
function checkArchive(bytes){
 const view=new DataView(bytes);let end=-1;
 for(let i=bytes.byteLength-22;i>=Math.max(0,bytes.byteLength-65557);i--){if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.byteLength){end=i;break}}
 if(end<0)throw new Error('This is not a supported XLSX archive.');
 if(view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0)throw new Error('Multipart archives are not supported.');
 const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true);let offset=view.getUint32(end+16,true),total=0;
 if(count>300||count===0||offset+size>end)throw new Error('This workbook is too complex. Export a smaller CSV instead.');
 for(let i=0;i<count;i++){
  if(offset+46>bytes.byteLength||view.getUint32(offset,true)!==0x02014b50)throw new Error('Invalid workbook directory.');
  const flags=view.getUint16(offset+8,true),compressed=view.getUint32(offset+20,true),uncompressed=view.getUint32(offset+24,true);
  total+=uncompressed;if(flags&1||uncompressed>2097152||total>8388608||uncompressed>Math.max(4096,compressed*200))throw new Error('Encrypted or unusually compressed workbooks are not supported.');
  offset+=46+view.getUint16(offset+28,true)+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);
 }
}
self.onmessage=({data})=>{
 try{
  const bytes=data.bytes;if(!(bytes instanceof ArrayBuffer)||bytes.byteLength>512000)throw new Error('Choose a file smaller than 500 KB.');
  const extension=String(data.name).split('.').pop().toLowerCase();if(!['xlsx','csv','tsv'].includes(extension))throw new Error('Choose XLSX, CSV, or TSV.');
  if(extension==='xlsx')checkArchive(bytes);
  const workbook=XLSX.read(bytes,{type:'array',dense:true,sheetRows:2001,cellFormula:false,cellHTML:false,bookVBA:false,bookDeps:false,raw:true});
  if(workbook.SheetNames.length>10)throw new Error('Use a workbook with no more than 10 sheets.');
  const parts=[];
  for(const name of workbook.SheetNames){const sheet=workbook.Sheets[name];const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1');if(range.e.r>=2000||range.e.c>=100)throw new Error('Limit each sheet to 2,000 rows and 100 columns.');parts.push(name+'\n'+XLSX.utils.sheet_to_csv(sheet,{blankrows:false,strip:true}));}
  const text=parts.join('\n\n');if(text.length>100000)throw new Error('The extracted text exceeds 100,000 characters. Import a smaller selection.');
  self.postMessage({text});
 }catch(error){self.postMessage({error:error.message||'Unable to read this spreadsheet.'})}
};
