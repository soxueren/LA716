/* eslint-disable */
import * as iconv from "iconv-lite";
import fs from "fs";

export const LA716_HEAD_SIZE = 512;
export const FLOAT_SIZE = 4;
export const LA716_HEAD_OFFSET = {
  ecc_offset: 0, //4B
  comp_offset: 4, //80B
  well_offset: 4 + 80, //80B
  numlog_offset: 4 + 80 * 2, //2B-number of logs
  b0_offset: 4 + 80 * 2 + 2, //2B
  lognames_offset: 4 + 80 * 2 + 2 + 2, //80B
  stdep_offset: 4 + 80 * 3 + 2 + 2, //4B
  endep_offset: 4 + 80 * 3 + 2 + 2 + 4, //4B
  rlev_offset: 4 + 80 * 3 + 2 + 2 + 4 + 4, //4B
  b1_offset: 4 + 80 * 3 + 2 + 2 + 4 + 4 + 4, //4B
  spcpr_offset: 4 + 80 * 3 + 2 + 2 + 4 + 4 + 4 + 4, //4B
  b2_offset: 4 + 80 * 3 + 2 + 2 + 4 + 4 + 4 + 4 + 4 //8B
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
  //8B
  b2: number;
}

export class LA716Parser {
  fileName: string;
  fileSize: number;
  header: LA716Header;
  blockLength: number;
  blockNum: number;
  body: number[][];

  constructor(filename: string) {
    this.fileName = filename;
    const fd = fs.openSync(filename, "r");
    const stat = fs.fstatSync(fd);
    this.fileSize = stat.size;
    fs.closeSync(fd);
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

  getStatistics(buf: any): void {
    this.header = {
      ecc: buf
        .slice(LA716_HEAD_OFFSET.ecc_offset, LA716_HEAD_OFFSET.ecc_offset + 4)
        .readUInt32LE(0),
      comp: this.toString(
        buf.slice(
          LA716_HEAD_OFFSET.comp_offset,
          LA716_HEAD_OFFSET.comp_offset + 80
        )
      ),
      well: this.toString(
        buf.slice(
          LA716_HEAD_OFFSET.well_offset,
          LA716_HEAD_OFFSET.well_offset + 80
        )
      ),
      numlog: buf
        .slice(
          LA716_HEAD_OFFSET.numlog_offset,
          LA716_HEAD_OFFSET.numlog_offset + 2
        )
        .readInt16LE(0),
      b0: buf
        .slice(LA716_HEAD_OFFSET.b0_offset, LA716_HEAD_OFFSET.b0_offset + 2)
        .readInt16LE(0),
      lognames: this.toString(
        buf.slice(
          LA716_HEAD_OFFSET.lognames_offset,
          LA716_HEAD_OFFSET.lognames_offset + 80
        )
      ),
      //4B
      stdep: buf
        .slice(
          LA716_HEAD_OFFSET.stdep_offset,
          LA716_HEAD_OFFSET.stdep_offset + 4
        )
        .readFloatLE(0),
      //4B
      endep: buf
        .slice(
          LA716_HEAD_OFFSET.endep_offset,
          LA716_HEAD_OFFSET.endep_offset + 4
        )
        .readFloatLE(0),
      //4B-采样间隔
      rlev: buf
        .slice(LA716_HEAD_OFFSET.rlev_offset, LA716_HEAD_OFFSET.rlev_offset + 4)
        .readFloatLE(0),
      b1: buf
        .slice(LA716_HEAD_OFFSET.b1_offset, LA716_HEAD_OFFSET.b1_offset + 4)
        .readFloatLE(0),
      spcpr: buf
        .slice(
          LA716_HEAD_OFFSET.spcpr_offset,
          LA716_HEAD_OFFSET.spcpr_offset + 4
        )
        .readFloatLE(0),
      b2: buf
        .slice(LA716_HEAD_OFFSET.b2_offset, LA716_HEAD_OFFSET.b2_offset + 4)
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
  }

  getData(buf: any) {
    if (this.header.numlog > 40) {
      geotoolkit.log("parse header error!");
      return;
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
      fs.open(this.fileName, "r", (status, fd) => {
        if (status) {
          geotoolkit.log(status.message);
          return;
        }
        const data = new Uint8Array(LA716_HEAD_SIZE),
          buffer = Buffer.from(data.buffer);
        fs.read(fd, buffer, 0, LA716_HEAD_SIZE, 0, (err, bytesRead, b) => {
          fs.closeSync(fd);
          this.getStatistics(b);
          resolve(this);
        });
      });
    });
  }

  parseBody() {
    if (this.header.numlog > 40 || this.header.numlog < 1) {
      geotoolkit.log("parse header error!");
      return;
    }
    return new Promise((resolve: any, reject: any) => {
      fs.open(this.fileName, "r", (status, fd) => {
        if (status) {
          geotoolkit.log(status.message);
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
            this.getData(b);
            resolve(this);
          }
        );
      });
    });
  }
}
