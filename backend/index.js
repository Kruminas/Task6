const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(cors());
app.use(express.json());

const presentations = {};

app.use(express.static(path.join(__dirname, "../frontend/build")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
});

app.get("/api/presentations", (req, res) => {
  const list = Object.values(presentations).map((p) => ({
    id: p.id,
    name: p.name,
  }));
  res.json(list);
});

app.post("/api/presentations", (req, res) => {
  const { name } = req.body;
  const newId = uuidv4();
  presentations[newId] = {
    id: newId,
    name,
    slides: [
      {
        id: uuidv4(),
        elements: [],
      },
    ],
    creatorId: null,
    users: {},
  };
  res.json({ success: true, presentationId: newId });
});

app.get("/api/presentations/:presentationId", (req, res) => {
  const { presentationId } = req.params;
  if (!presentations[presentationId]) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json(presentations[presentationId]);
});

io.on("connection", (socket) => {
  let currentPresentationId = null;

  socket.on("join-presentation", ({ presentationId, nickname }) => {
    if (!presentations[presentationId]) {
      socket.emit("error-message", "Presentation not found");
      return;
    }
    currentPresentationId = presentationId;
    socket.join(presentationId);

    const pres = presentations[presentationId];
    if (!pres.creatorId && Object.keys(pres.users).length === 0) {
      pres.creatorId = socket.id;
      pres.users[socket.id] = { nickname, role: "creator" };
    } else {
      pres.users[socket.id] = { nickname, role: "viewer" };
    }

    socket.emit("presentation-data", pres);
    io.to(presentationId).emit("update-user-list", pres.users);
  });

  socket.on("update-user-role", ({ userSocketId, newRole }) => {
    const pres = presentations[currentPresentationId];
    if (!pres) return;
    if (pres.creatorId !== socket.id) return;
    if (!pres.users[userSocketId]) return;

    if (userSocketId === pres.creatorId && newRole !== "creator") {
      return;
    }
    pres.users[userSocketId].role = newRole;
    io.to(currentPresentationId).emit("update-user-list", pres.users);
  });

  socket.on("add-slide", () => {
    const pres = presentations[currentPresentationId];
    if (!pres) return;
    if (pres.creatorId !== socket.id) return;

    pres.slides.push({ id: uuidv4(), elements: [] });
    io.to(currentPresentationId).emit("presentation-data", pres);
  });

  socket.on("remove-slide", (slideId) => {
    const pres = presentations[currentPresentationId];
    if (!pres) return;
    if (pres.creatorId !== socket.id) return;

    pres.slides = pres.slides.filter((s) => s.id !== slideId);
    io.to(currentPresentationId).emit("presentation-data", pres);
  });

  socket.on("update-element", ({ slideId, element }) => {
    const pres = presentations[currentPresentationId];
    if (!pres) return;

    const myRole = pres.users[socket.id]?.role;
    if (myRole !== "creator" && myRole !== "editor") return;

    const slide = pres.slides.find((s) => s.id === slideId);
    if (!slide) return;

    if (!element.id) {
      element.id = uuidv4();
      if (element.content === undefined) {
        element.content = "";
      }
      slide.elements.push(element);
    } else {
      const idx = slide.elements.findIndex((el) => el.id === element.id);
      if (idx >= 0) {
        slide.elements[idx] = element;
      } else {
        slide.elements.push(element);
      }
    }
    io.to(currentPresentationId).emit("presentation-data", pres);
  });

  socket.on("remove-shape", ({ slideId, shapeId }) => {
    const pres = presentations[currentPresentationId];
    if (!pres) return;

    const myRole = pres.users[socket.id]?.role;
    if (myRole !== "creator" && myRole !== "editor") return;

    const slide = pres.slides.find((s) => s.id === slideId);
    if (!slide) return;

    slide.elements = slide.elements.filter((el) => el.id !== shapeId);
    io.to(currentPresentationId).emit("presentation-data", pres);
  });

  socket.on("update-thumbnail", ({ thumbnail }) => {
    console.log("Thumbnail updated:", thumbnail);
  });

  socket.on("disconnect", () => {
    if (currentPresentationId && presentations[currentPresentationId]) {
      const pres = presentations[currentPresentationId];
      delete pres.users[socket.id];

      if (pres.creatorId === socket.id) {
        const remain = Object.keys(pres.users);
        if (remain.length > 0) {
          const newCreatorSocketId = remain[0];
          pres.creatorId = newCreatorSocketId;
          pres.users[newCreatorSocketId].role = "creator";
        } else {
          pres.creatorId = null;
        }
      }
      io.to(currentPresentationId).emit("update-user-list", pres.users);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});