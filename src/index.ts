#!/usr/bin/env node

const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
var cors = require("cors");
const app = express();
const port = 3939;

app.use(bodyParser.json());
app.use(cors());
var http = require("http").createServer(app);

const { Docker } = require("node-docker-api");

let docker: any = undefined;

const registerInNetwork = async (containerData: any) => {
  const exists = await docker.network.list({
    filters: { name: ["ceresnetwork"] },
  });

  if (exists.length === 0) {
    const network = await docker.network.create({ name: "ceresnetwork" });
    const cc = await network.connect(containerData);
    return cc;
  } else {
    const network = docker.network.get(exists[0].data.Id);
    try {
      const cc = await network.connect(containerData);
      return cc;
    } catch (error) {
      console.log("error", error);
    }
  }
};

app.get("/docker-status", (req: any, res: any) => {
  docker.ping().then((result: any) => {
    res.json(result);
  }).catch((err: any) => {
    res.json(err);
  });
});

app.get("/container/running", (req: any, res: any) => {
  docker.container
    .list({ filters: { label: ["ceres"] } })
    // Inspect
    .then((containers: []) => {
      const list = containers.map((item: { data: any }) => item.data);

      res.json(list);
    })
    .catch((error: Error) => console.log(error));
});

app.get("/container/list", (req: any, res: any) => {
  docker.container
    .list({ all: true, filters: { label: ["ceres"] } })
    // Inspect
    .then((containers: any) => {
      const list = containers.map((item: any) => item.data);

      res.json(list);
    })
    .catch((error: any) => console.log(error));
});

const startContainer = async (image: any) => {
  const containers = await docker.container.list({
    all: true,
    filters: { label: ["ceres"] },
  });

  const exists = containers.find(
    (item: any) => item.data.Labels.ceres === image.ceres
  );

  if (exists !== undefined) {
    await exists.start();

    const status = await exists.status();

    return status.data;
  } else {
    const createOptions = {
      Image: `${image.ceres}:latest`,
      name: image.ceres,
      Labels: {
        ceres: image.ceres,
        containerPort: image.containerPort,
        hostPort: image.hostPort,
        name: image.name,
      },
      HostConfig: {
        PortBindings: {},
      },
      ExposedPorts: {},
    };
    createOptions["HostConfig"]["PortBindings"][image.containerPort] = [
      { HostPort: image.hostPort },
    ];
    createOptions["ExposedPorts"][image.containerPort] = {};

    const container = await docker.container.create(createOptions);
    await registerInNetwork({ Container: container.data.Id });
    await container.start();

    const status = await container.status();
    return status.data;
  }
};

app.post("/container/start", (req: any, res: any) => {
  const image = req.body.image || undefined;

  docker.container
    .list({ all: true, filters: { label: ["ceres"] } })
    .then((containers: any) => {
      const exists = containers.find(
        (item: any) => item.data.Labels.ceres === image
      );

      if (exists !== undefined) {
        exists
          .start()
          .then(async (container: any) => {
            await registerInNetwork({ Container: container.data.Id });
            const status = await container.status();

            res.json(status.data);
          })

          .catch((error: any) => res.json(error.json));
      } else {
        res.end("Container not found. Please reinstall Service Image");
      }
    })
    .catch((error: any) => res.json(error.json));
});

app.post("/container/stop", (req: any, res: any) => {
  const id = req.body.id;

  const container = docker.container.get(id);

  container
    .stop()
    .then((response: any) => res.json(response))
    .catch((error: any) => res.json(error.json));
});

app.post("/container/status", (req: any, res: any) => {
  const id = req.body.id;

  try {
    const container = docker.container.get(id);
    container.status().then((status: any) => {
      res.json(status.data);
    });
  } catch (error) {
    res.json(error);
  }
});

app.get("/image/list", (req: any, res: any) => {
  docker.image.list({ filters: { label: ["ceres"] } }).then((images: any) => {
    res.json(images);
  });
});

app.get("/image/available", (req: any, res: any) => {
  const images = [
    {
      name: "Isolated Server Instance",
      image: "isolatedserver",
      tarbal: "isolatedserver.tar.gz",
      labels: {
        name: "Isolated Server Instance",
        ceres: "isolatedserver",
        containerPort: "5555",
        hostPort: "5555",
      },
      installed: false,
    },
    {
      name: "Isolated Server Faucet",
      image: "isolatedserverfaucet",
      tarbal: "isolatedserverfaucet.tar.gz",
      labels: {
        name: "Isolated Server Faucet",
        ceres: "isolatedserverfaucet",
        containerPort: "5556",
        hostPort: "5556",
      },
      installed: false,
    },
    {
      name: "Local Network Explorer",
      image: "devex",
      installed: false,
      tarbal:
        "https://storage.googleapis.com/staging.personal-website-fc11b.appspot.com/test.tar.gz",
    },
  ];
  return res.json(images);
});

app.post("/image/build", (req: any, res: any) => {
  const name = req.body.image;
  const file = `./images/${name}.tar.gz`;
  const labels = req.body.labels;

  docker.image
    .build(file, {
      t: name,
      pull: name,
      nocache: true,
      rm: true,
      labels,
    })
    .then(
      (stream: any) =>
        new Promise((resolve, reject) => {
          stream.on("data", (data: any) => console.log(data.toString()));
          stream.on("end", async () => {
            const im = await docker.image.get(name).status();
            const container = await startContainer(
              im.data.ContainerConfig.Labels
            );

            console.log(container);
            res.json(container);
          });
          stream.on("error", (error: any) => res.json(error));
        })
    )
    .then(async (image: any) => {
      const container = await startContainer(image);
      res.json(container);
    })
    .catch((error: any) => console.log(error));
});

app.post('/docker-init', (req: any, res: any) => {
  const dpath = req.body.docker_path;

  docker = new Docker({ socketPath: dpath })

  res.json(docker);
});

const io = require("socket.io")(http);

io.on("connection", (socket: any) => {
  const promisifyStream = (stream: any, channel: any) =>
    new Promise((resolve, reject) => {
      stream.on("data", (data: any) =>
        io.emit(channel, JSON.stringify({ stream: data.toString("UTF-8") }))
      );
      stream.on("end", resolve);
      stream.on("error", reject);
    });

  socket.on("docker-ping", async () => {
    try {
      const ping = await docker.ping();
      io.emit("docker-ping", { success: ping });
    } catch (error) {
      io.emit("docker-ping", error);
    }
  });

  socket.on("container-logs", async (id: any) => {
    console.log("Get container logs: " + id);

    const container = docker.container.get(id);

    const status = await container.status();

    const since = Math.round(
      new Date(status.data.State.StartedAt).getTime() / 1000 - 100
    );

    container
      .logs({
        follow: true,
        stdout: true,
        stderr: true,
        tail: 100,
        since: since,
      })
      .then((stream: any) => promisifyStream(stream, id))
      .catch((error: any) => promisifyStream(error, id));
  });

  socket.on("remove-image", async ({ image, container }: any) => {
    try {
      await docker.container
        .get(container)
        .delete({ force: true });

      await docker.image.get(image).remove({ force: true });

      io.emit("uninstall-logs", JSON.stringify({ success: true }));
    } catch (error) {

      io.emit("uninstall-logs", JSON.stringify({ success: false, ...error.json }));

    } finally {
      io.emit("uninstall-logs", JSON.stringify({ success: true, status: "Container and image sucessfully removed." }));
    }
  });

  socket.on("build-image", async (image: any) => {
    const labels = image.labels;

    console.log("Build image: " + image.image);

    docker.image
      .create({}, {
        fromImage: image.image,
        tag: image.tag,
        labels
      })
      .then((stream: any) => promisifyStream(stream, "install-logs"))
      .then(async () => {
        const createOptions = {
          Image: `${image.image}:${image.tag}`,
          name: `ceres-${image.labels.ceres}`,
          Labels: {
            ceres: image.image,
            containerPort: image.labels.containerPort,
            hostPort: image.labels.hostPort,
            name: `ceres-${image.labels.ceres}`,
          },
          HostConfig: {
            PortBindings: {},
          },
          ExposedPorts: {},
        };
        createOptions["HostConfig"]["PortBindings"][
          image.labels.containerPort
        ] = [{ HostPort: image.labels.hostPort }];
        createOptions["ExposedPorts"][image.labels.containerPort] = {};

        const container = await docker.container.create(createOptions);
        //await container.start();
        await registerInNetwork({ Container: container.data.Id });

        console.log("Container successfully generated " + container.data.Id);
        io.emit(
          "install-logs",
          JSON.stringify({
            stream: "Container successfully generated " + container.data.Id,
          })
        );
        io.emit("install-logs", JSON.stringify({ success: true }));
      })
      .catch((error: any) => console.log(error));
  });
});

http.listen(port, () => {
  console.log(`Server listening on ${port}.API`);
});