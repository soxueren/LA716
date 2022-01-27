/* eslint-disable */
/*
 * @la716-browser: 716 format parser for browser.
 * @author soxueren <soxueren@126.com>
 */
import * as iconv from "iconv-lite";

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
  spcpr: { offset: 4 + 80 * 3 + 2 + 2 + 4 + 4 + 4 + 4, length: 4 }, //4B
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
  file: File;
  fileName: string;
  fileSize: number = 0;
  header: LA716Header;
  blockLength: number = 0;
  blockNum: number = 0;
  body: number[][];

  constructor(file: File) {
    this.file = file;
    this.fileName = file.name;
    this.fileSize = file.size;
  }

  toString(buf: ArrayBuffer): string {
    let bytes = Buffer.from(buf);
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
  /**
   * 解析LA716数据头核心算法
   */
  getStatistics(buf: ArrayBuffer): number {
    if (buf.byteLength < 1) {
      return -1;
    }
    this.header = {
      ecc: new DataView(
        buf.slice(
          LA716_HEAD.ecc.offset,
          LA716_HEAD.ecc.offset + LA716_HEAD.ecc.length
        )
      ).getUint32(0, true),
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
      numlog: new DataView(
        buf.slice(
          LA716_HEAD.numlog.offset,
          LA716_HEAD.numlog.offset + LA716_HEAD.numlog.length
        )
      ).getUint16(0, true),
      b0: new DataView(
        buf.slice(
          LA716_HEAD.b0.offset,
          LA716_HEAD.b0.offset + LA716_HEAD.b0.length
        )
      ).getUint16(0, true),
      lognames: this.toString(
        buf.slice(
          LA716_HEAD.lognames.offset,
          LA716_HEAD.lognames.offset + LA716_HEAD.lognames.length
        )
      ),
      //4B
      stdep: new DataView(
        buf.slice(
          LA716_HEAD.stdep.offset,
          LA716_HEAD.stdep.offset + LA716_HEAD.stdep.length
        )
      ).getFloat32(0, true),
      //4B
      endep: new DataView(
        buf.slice(
          LA716_HEAD.endep.offset,
          LA716_HEAD.endep.offset + LA716_HEAD.endep.length
        )
      ).getFloat32(0, true),
      //4B-采样间隔
      rlev: new DataView(
        buf.slice(
          LA716_HEAD.rlev.offset,
          LA716_HEAD.rlev.offset + LA716_HEAD.rlev.length
        )
      ).getFloat32(0, true),
      b1: new DataView(
        buf.slice(
          LA716_HEAD.b1.offset,
          LA716_HEAD.b1.offset + LA716_HEAD.b1.length
        )
      ).getFloat32(0, true),
      spcpr: new DataView(
        buf.slice(
          LA716_HEAD.spcpr.offset,
          LA716_HEAD.spcpr.offset + LA716_HEAD.spcpr.length
        )
      ).getFloat32(0, true),
    };
    this.blockNum =
      1 +
      Math.floor(
        (this.header.endep - this.header.stdep) /
          this.header.rlev /
          this.header.spcpr
      );
    this.blockLength = this.header.spcpr * this.header.numlog * FLOAT_SIZE;
    return 1;
  }

  /**
   * 解析LA716数据体核心算法
   */
  getData(buf: ArrayBuffer): number {
    if (this.header.numlog > MAX_LOG_NUM || buf.byteLength < 1) {
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
          let val = new DataView(buf.slice(st_offset, end_offset)).getFloat32(
            0,
            true
          );
          if (val == -9999) val = 0;
          blk_curves[k] = val;
          //console.log(i, ":", j, ":", st_offset, end_offset);
        }
        //单曲线填充
        this.body[j] = [...this.body[j], ...blk_curves];
      }
    }
    return 1;
  }
}

/**
 * LA716Reader
 */
export class LA716Reader extends LA716Parser {
  constructor(file: File) {
    super(file);
  }

  static getReaderInstance(file: File): LA716Reader {
    let reader = new LA716Reader(file);
    return reader;
  }

  parseHeader(): any {
    return new Promise((resolve: any, reject: any) => {
      if (this.fileSize < 1) {
        reject(new Error(this.fileName + " is not valid!"));
        return;
      }
      let slice = this.file.slice(0, LA716_HEAD_SIZE);
      let reader = new FileReader();
      reader.onload = (e) => {
        let b = e.target.result;
        if (this.getStatistics(b as ArrayBuffer) == -1) {
          reject(new Error("parse header error!"));
        }
        resolve(this);
      };
      reader.onerror = (e) => {
        reject(e);
        return;
      };
      reader.readAsArrayBuffer(slice);
    });
  }
  parseBody() {
    return new Promise((resolve: any, reject: any) => {
      if (this.header.numlog > MAX_LOG_NUM || this.header.numlog < 1) {
        reject(new Error(this.fileName + " is not valid!"));
        return;
      }
      const buf_len = this.blockLength * this.blockNum;
      let slice = this.file.slice(LA716_HEAD_SIZE, buf_len);
      let reader = new FileReader();
      reader.onload = (e) => {
        let b = e.target.result;
        if (this.getData(b as ArrayBuffer) == -1) {
          reject(new Error("parse body Error"));
        }
        resolve(this);
      };
      reader.onerror = (e) => {
        reject(e);
        return;
      };
      reader.readAsArrayBuffer(slice);
    });
  }
}
