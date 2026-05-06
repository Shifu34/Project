"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = void 0;
const livekit_server_sdk_1 = require("livekit-server-sdk");
const env_1 = require("../config/env");
const generateToken = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) {
            res.status(401).json({ success: false, message: 'Not authenticated' });
            return;
        }
        const userId = user.userId;
        const roleName = user.roleName;
        const rawJwt = req.headers.authorization.split(' ')[1];
        const intent = req.body?.intent ?? null;
        const appointmentId = req.body?.appointment_id ? Number(req.body.appointment_id) : null;
        const isDoctor = roleName === 'doctor';
        const identity = isDoctor ? `doctor-${userId}` : `patient-${userId}`;
        const agentName = isDoctor ? 'murshid-doctor-agent' : 'murshid-hospital-agent';
        const roomName = `voice-${userId}-${Math.floor(Date.now() / 1000)}`;
        // Metadata passed to both the participant token and agent dispatch.
        // Agent code reads token (for auth), intent (for sub-agent routing),
        // and appointment_id (for doctor context).
        const metadata = JSON.stringify({ token: rawJwt, intent, appointment_id: appointmentId });
        // Step 1: Pre-create the room so agent dispatch has a target room to join.
        // Without this, createDispatch fails silently because the room doesn't exist yet.
        const roomService = new livekit_server_sdk_1.RoomServiceClient(env_1.env.livekitUrl, env_1.env.livekitApiKey, env_1.env.livekitApiSecret);
        await roomService.createRoom({
            name: roomName,
            emptyTimeout: 300, // auto-delete after 5 min empty
            maxParticipants: 10,
        });
        // Step 2: Explicitly dispatch the agent into the now-existing room.
        const dispatchClient = new livekit_server_sdk_1.AgentDispatchClient(env_1.env.livekitUrl, env_1.env.livekitApiKey, env_1.env.livekitApiSecret);
        await dispatchClient.createDispatch(roomName, agentName, { metadata });
        // Step 3: Build participant token for the Flutter client.
        const token = new livekit_server_sdk_1.AccessToken(env_1.env.livekitApiKey, env_1.env.livekitApiSecret, {
            identity,
            ttl: '1h',
        });
        token.metadata = metadata;
        token.addGrant({
            roomJoin: true,
            roomCreate: true,
            canPublish: true,
            canSubscribe: true,
            room: roomName,
        });
        // Keep as fallback hint
        token.roomConfig = new livekit_server_sdk_1.RoomConfiguration({
            agents: [new livekit_server_sdk_1.RoomAgentDispatch({ agentName })],
        });
        const jwt = await token.toJwt();
        res.json({
            success: true,
            data: {
                token: jwt,
                url: env_1.env.livekitUrl,
            },
        });
    }
    catch (err) {
        next(err);
    }
};
exports.generateToken = generateToken;
//# sourceMappingURL=livekit.controller.js.map