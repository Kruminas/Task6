const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const mongoose = require("mongoose");
const Presentation = require("./models/Presentation");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, "../frontend/build")));

app.get("/api/presentations", async (req, res) => {
  try {
    const allPresentations = await Presentation.find({}, { _id: 0, id: 1, name: 1 });
    res.json(allPresentations);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/presentations", async (req, res) => {
  try {
    const { name } = req.body;
    const newId = uuidv4();
    const newPresentation = new Presentation({
      id: newId,
      name,
      slides: [{ id: uuidv4(), elements: [] }],
      creatorId: null,
      users: {},
    });
    await newPresentation.save();
    res.json({ success: true, presentationId: newId });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/presentations/:presentationId", async (req, res) => {
  try {
    const { presentationId } = req.params;
    const presentation = await Presentation.findOne({ id: presentationId });
    if (!presentation) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(presentation);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
});

io.on("connection", (socket) => {
  let currentPresentationId = null;

  socket.on("join-presentation", async ({ presentationId, nickname }) => {
    const pres = await Presentation.findOne({ id: presentationId });
    if (!pres) {
      socket.emit("error-message", "Presentation not found");
      return;
    }
    currentPresentationId = presentationId;
    socket.join(presentationId);
    if (!pres.creatorId && pres.users.size === 0) {
      pres.creatorId = socket.id;
      pres.users.set(socket.id, { nickname, role: "creator" });
    } else {
      pres.users.set(socket.id, { nickname, role: "viewer" });
    }
    await pres.save();
    socket.emit("presentation-data", pres);
    io.to(presentationId).emit("update-user-list", Object.fromEntries(pres.users));
  });

  socket.on("update-user-role", async ({ userSocketId, newRole }) => {
    if (!currentPresentationId) return;
    const pres = await Presentation.findOne({ id: currentPresentationId });
    if (!pres) return;
    if (pres.creatorId !== socket.id) return;
    if (!pres.users.has(userSocketId)) return;
    if (userSocketId === pres.creatorId && newRole !== "creator") return;
    const userData = pres.users.get(userSocketId);
    userData.role = newRole;
    pres.users.set(userSocketId, userData);
    await pres.save();
    io.to(currentPresentationId).emit("update-user-list", Object.fromEntries(pres.users));
  });

  socket.on("add-slide", async () => {
    if (!currentPresentationId) return;
    const pres = await Presentation.findOne({ id: currentPresentationId });
    if (!pres) return;
    if (pres.creatorId !== socket.id) return;
    pres.slides.push({ id: uuidv4(), elements: [] });
    await pres.save();
    io.to(currentPresentationId).emit("presentation-data", pres);
  });

  socket.on("remove-slide", async (slideId) => {
    if (!currentPresentationId) return;
    const pres = await Presentation.findOne({ id: currentPresentationId });
    if (!pres) return;
    if (pres.creatorId !== socket.id) return;
    pres.slides = pres.slides.filter((s) => s.id !== slideId);
    await pres.save();
    io.to(currentPresentationId).emit("presentation-data", pres);
  });

  socket.on("update-element", async ({ slideId, element }) => {
    if (!currentPresentationId) return;
    const pres = await Presentation.findOne({ id: currentPresentationId });
    if (!pres) return;
    const myRole = pres.users.get(socket.id)?.role;
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
    await pres.save();
    io.to(currentPresentationId).emit("presentation-data", pres);
  });

  socket.on("remove-shape", async ({ slideId, shapeId }) => {
    if (!currentPresentationId) return;
    const pres = await Presentation.findOne({ id: currentPresentationId });
    if (!pres) return;
    const myRole = pres.users.get(socket.id)?.role;
    if (myRole !== "creator" && myRole !== "editor") return;
    const slide = pres.slides.find((s) => s.id === slideId);
    if (!slide) return;
    slide.elements = slide.elements.filter((el) => el.id !== shapeId);
    await pres.save();
    io.to(currentPresentationId).emit("presentation-data", pres);
  });

  socket.on("update-thumbnail", ({ thumbnail }) => {
    console.log("Thumbnail updated:", thumbnail);
  });

  socket.on("disconnect", async () => {
    if (!currentPresentationId) return;
    const pres = await Presentation.findOne({ id: currentPresentationId });
    if (!pres) return;
    if (!pres.users.has(socket.id)) return;
    pres.users.delete(socket.id);
    if (pres.creatorId === socket.id) {
      const remaining = Array.from(pres.users.keys());
      if (remaining.length > 0) {
        const newCreatorSocketId = remaining[0];
        pres.creatorId = newCreatorSocketId;
        const newCreatorData = pres.users.get(newCreatorSocketId);
        newCreatorData.role = "creator";
        pres.users.set(newCreatorSocketId, newCreatorData);
      } else {
        pres.creatorId = null;
      }
    }
    await pres.save();
    io.to(currentPresentationId).emit("update-user-list", Object.fromEntries(pres.users));
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
