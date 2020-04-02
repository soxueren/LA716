/* eslint-disable */
import * as iconv from "iconv-lite";
import fs from "fs";

const LA716_HEAD_SIZE = 512;
const FLOAT_SIZE = 4;
const MAX_LOG_NUM = 40;
export const LA716_HEAD = {
  ecc: { offset: 0, length: 4 }, //4B
  comp: { offset: 4, length: 80 }, //80B
  well: { offset: 4 + 80, length: 80 }, //80B
  numlog: { offset: 4 + 80 * 2, length: 2 }, //2B-number of logs
  b0: { offset: 4 + 80 * 2 + 2, length: 2 }, //2B
  lognames: { offset: 4 + 80 * 2 + 2 + 2, length: 80 }, //80B
  stdep: { offset: 4 + 80 * 3 + 2 + 2, length: 4 }, //4B
  endep: { offset: 4 + 80 * 3 + 2 + 2 + 4, length: 4 }, //4B
  rlev: { offset: 4 + 80 * 3 + 2 + 2 + 4 + 4, length: 4 }, //4B
  b1: { offset: 4 + 80 * 3 + 2 + 2 + 4 + 4 + 4, length: 4 }, //4B
  spcpr: { offset: 4 + 80 * 3 + 2 + 2 + 4 + 4 + 4 + 4, length: 4 } //4B
  //b2: { offset: 4 + 80 * 3 + 2 + 2 + 4 + 4 + 4 + 4 + 4, length: 4 }, //4B
  //b3: { offset: 4 + 80 * 3 + 2 + 2 + 4 + 4 + 4 + 4 + 4 + 4, length: 4 } //4B
};
export interface LA716Header {
  //4B
  ecc: number;
  //80B
  comp: string;
  //80B
  well: string;
  //2B-曲线条数
  numlog: number;
  //2B
  b0: number;
  //80B-曲线名称
  lognames: string;
  //4B
  stdep: number;
  //4B
  endep: number;
  //4B-采样间隔
  rlev: number;
  //4B
  b1: number;
  //4B-采样点数
  spcpr: number;
  //4B
  //b2: number;
  //4B
  //b3: number;
}

export class LA716Parser {
  fileName: string;
  fileSize: number = 0;
  header: LA716Header;
  blockLength: number = 0;
  blockNum: number = 0;
  body: number[][];

  constructor(filename: string) {
    this.fileName = filename;
    try {
      if (fs.existsSync(filename)) {
        const fd = fs.openSync(filename, "r");
        const stat = fs.fstatSync(fd);
        this.fileSize = stat.size;
        fs.closeSync(fd);
      }
    } catch (e) {
      console.error(e);
    }
  }

  toString(bytes: any): string {
    let str = iconv.decode(bytes, "gbk").trim();
    str = str.replace(/[^\u4E00-\u9FA5|^\w|^\s]/g, "").trim();
    str = str.replace(/<\/?.+?>/g, "").trim();
    str = str.replace(/[\r\n]/g, "").trim();
    //BUG
    str = str.replace(/CALI/g, "CALI  ").trim();
    str = str.replace(/R025/g, " R025 ").trim();
    str = str.replace(/BZSP/g, " BZSP ").trim();
    str = str.replace(/R2M/g, " R2M ").trim();
    str = str.replace(/\s+/g, ",").trim();
    //TODO 曲线名称处理 egg: den->RHOB
    return str;
  }

  getStatistics(buf: Buffer): number {
    if (this.fileSize == 0) {
      console.log(this.fileName + " is not found!");
      return -1;
    }
    this.header = {
      ecc: buf
        .slice(
          LA716_HEAD.ecc.offset,
          LA716_HEAD.ecc.offset + LA716_HEAD.ecc.length
        )
        .readUInt32LE(0),
      comp: this.toString(
        buf.slice(
          LA716_HEAD.comp.offset,
          LA716_HEAD.comp.offset + LA716_HEAD.comp.length
        )
      ),
      well: this.toString(
        buf.slice(
          LA716_HEAD.well.offset,
          LA716_HEAD.well.offset + LA716_HEAD.well.length
        )
      ),
      numlog: buf
        .slice(
          LA716_HEAD.numlog.offset,
          LA716_HEAD.numlog.offset + LA716_HEAD.numlog.length
        )
        .readInt16LE(0),
      b0: buf
        .slice(
          LA716_HEAD.b0.offset,
          LA716_HEAD.b0.offset + LA716_HEAD.b0.length
        )
        .readInt16LE(0),
      lognames: this.toString(
        buf.slice(
          LA716_HEAD.lognames.offset,
          LA716_HEAD.lognames.offset + LA716_HEAD.lognames.length
        )
      ),
      //4B
      stdep: buf
        .slice(
          LA716_HEAD.stdep.offset,
          LA716_HEAD.stdep.offset + LA716_HEAD.stdep.length
        )
        .readFloatLE(0),
      //4B
      endep: buf
        .slice(
          LA716_HEAD.endep.offset,
          LA716_HEAD.endep.offset + LA716_HEAD.endep.length
        )
        .readFloatLE(0),
      //4B-采样间隔
      rlev: buf
        .slice(
          LA716_HEAD.rlev.offset,
          LA716_HEAD.rlev.offset + LA716_HEAD.rlev.length
        )
        .readFloatLE(0),
      b1: buf
        .slice(
          LA716_HEAD.b1.offset,
          LA716_HEAD.b1.offset + LA716_HEAD.b1.length
        )
        .readFloatLE(0),
      spcpr: buf
        .slice(
          LA716_HEAD.spcpr.offset,
          LA716_HEAD.spcpr.offset + LA716_HEAD.spcpr.length
        )
        .readFloatLE(0)
    };
    this.blockNum =
      1 +
      Math.floor(
        (this.header.endep - this.header.stdep) /
          this.header.rlev /
          this.header.spcpr
      );
    this.blockLength = this.header.spcpr * this.header.numlog * FLOAT_SIZE;
    buf.fill(null);
    return 1;
  }

  getData(buf: Buffer): number {
    if (this.header.numlog > MAX_LOG_NUM || this.fileSize == 0) {
      console.log("header is not valid!");
      return -1;
    }
    this.body = [];
    for (let i = 0; i < this.header.numlog; i++) {
      this.body.push([]);
    }

    for (let i = 0; i < this.blockNum; i++) {
      //块偏移->块索引X块长度
      let blk_offset = i * this.blockLength;
      for (let j = 0; j < this.header.numlog; j++) {
        let blk_curves = [];
        //块内偏移->曲线索引X曲线块长度，曲线块长度->(即采样点数*浮点长度)
        let curve_offset = j * this.header.spcpr * FLOAT_SIZE;
        for (let k = 0; k < this.header.spcpr; k++) {
          //采样点偏移->块偏移+块内偏移+点偏移,点偏移->(点索引*浮点长度)
          let st_offset = blk_offset + curve_offset + k * FLOAT_SIZE;
          let end_offset = st_offset + FLOAT_SIZE;
          let val = buf.slice(st_offset, end_offset).readFloatLE(0);
          if (val == -9999) val = 0;
          blk_curves[k] = val;
          //console.log(i, ":", j, ":", st_offset, end_offset);
        }
        //单曲线填充
        this.body[j] = [...this.body[j], ...blk_curves];
      }
    }
    buf.fill(null);
    return 1;
  }
}

export class LA716Reader extends LA716Parser {
  constructor(filename: string) {
    super(filename);
  }

  static getReaderInstance(filename: string): LA716Reader {
    let reader = new LA716Reader(filename);
    return reader;
  }

  parseHeader(): any {
    return new Promise((resolve: any, reject: any) => {
      fs.open(this.fileName, "r", (err, fd) => {
        if (err) {
          console.log(err.message);
          reject(err);
          return;
        }
        const data = new Uint8Array(LA716_HEAD_SIZE),
          buffer = Buffer.from(data.buffer);
        fs.read(fd, buffer, 0, LA716_HEAD_SIZE, 0, (err, bytesRead, b) => {
          fs.closeSync(fd);
          if (this.getStatistics(b) == -1) {
            reject(new Error("parse header error!"));
          }
          resolve(this);
        });
      });
    });
  }

  parseBody() {
    if (this.header.numlog > MAX_LOG_NUM || this.header.numlog < 1) {
      console.log("parse body error!");
      return;
    }
    return new Promise((resolve: any, reject: any) => {
      fs.open(this.fileName, "r", (err, fd) => {
        if (err) {
          reject(err);
          return;
        }
        const buf_len = this.blockLength * this.blockNum;
        const data = new Uint8Array(buf_len),
          buffer = Buffer.from(data.buffer);
        fs.read(
          fd,
          buffer,
          0,
          buf_len,
          LA716_HEAD_SIZE,
          (err, bytesRead, b) => {
            fs.closeSync(fd);
            if (this.getData(b) == -1) {
              reject(new Error("parse body Error"));
            }
            resolve(this);
          }
        );
      });
    });
  }
}
