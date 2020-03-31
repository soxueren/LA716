import express from "express";
import compression from "compression";  // compresses requests
import session from "express-session";
import bodyParser from "body-parser";
import lusca from "lusca";
import flash from "express-flash";
import path from "path";

// Controllers (route handlers)
import { Response, Request } from 'express';
import { LA716Reader } from './la716';

import cluster from "cluster";
// Code to run if we're in the master process
if (cluster.isMaster) {
    // Count the machine's CPUs
    const cpuCount = require("os").cpus().length;

    // Create a worker for each CPU
    for (let i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }

    cluster.on("listening", function (worker, address) {
        console.log("[master] " + "listening: worker" + worker.id + ",pid:" + worker.process.pid + ", 0.0.0.0:" + address.port);
    });

    // Listen for terminating workers
    cluster.on("exit", function (worker) {
        // Replace the terminated workers
        console.log("Worker " + worker.id + " died :("); // eslint-disable-line no-console
        cluster.fork();
    });

    // Code to run if we're in a worker process
} else {

// Create Express server
const app = express();

// Express configuration
app.set("port", process.env.PORT || 8000);
app.use(compression());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());
app.use(lusca.xframe("SAMEORIGIN"));
app.use(lusca.xssProtection(true));

app.use((req, res, next) => {
    res.locals.user = req.user;
    next();
});

app.use(
    express.static(path.join(__dirname, "public"), { maxAge: 31557600000 })
);

//设置允许跨域访问该服务.
app.use((req, res, next) =>{
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
        res.header("Access-Control-Allow-Methods","PUT,POST,GET,DELETE,OPTIONS");
        res.header("X-Powered-By","3.2.1");		
        res.header("Content-Type", "application/json;charset=utf-8");
        next();
});

if (app.get("env") === "development") {
    app.use(errorHandler());
}

const rootdir='/data/'

app.get("/la716/:file",  (req: Request, res: Response) =>{
 let filename = rootdir + req.params["file"] + ".716";
  const reader = LA716Reader.getReaderInstance(filename);
  reader.parseHeader().then((reader: any) => {
    reader.parseBody().then((reader: any) => {
      res.json({
        header: reader.header,
        body: reader.body
      });
    });
  });
});

/**
 * Start Express server.
 */
app.listen(app.get("port"), () => {
    console.log(
        "  App is running at http://localhost:%d in %s mode",
        app.get("port"),
        app.get("env")
    );
    console.log("  Press CTRL-C to stop\n");
});
}
