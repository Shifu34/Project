import { Response, NextFunction } from 'express';
import { AccessToken, RoomAgentDispatch, RoomConfiguration, AgentDispatchClient, RoomServiceClient } from 'livekit-server-sdk';
import { env } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';

export const generateToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const userId   = user.userId;
    const roleName = user.roleName;
    const rawJwt       = req.headers.authorization!.split(' ')[1];
    const intent       = (req.body?.intent as string) ?? null;
    const appointmentId = req.body?.appointment_id ? Number(req.body.appointment_id) : null;

    const isDoctor  = roleName === 'doctor';
    const identity  = isDoctor ? `doctor-${userId}` : `patient-${userId}`;
    const agentName = isDoctor ? 'murshid-doctor-agent' : 'murshid-hospital-agent';
    const roomName  = `voice-${userId}-${Math.floor(Date.now() / 1000)}`;

    // Metadata passed to both the participant token and agent dispatch.
    // Agent code reads token (for auth), intent (for sub-agent routing),
    // and appointment_id (for doctor context).
    const metadata = JSON.stringify({ token: rawJwt, intent, appointment_id: appointmentId });

    // Step 1: Pre-create the room so agent dispatch has a target room to join.
    // Without this, createDispatch fails silently because the room doesn't exist yet.
    const roomService = new RoomServiceClient(
      env.livekitUrl,
      env.livekitApiKey,
      env.livekitApiSecret,
    );
    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 300, // auto-delete after 5 min empty
      maxParticipants: 10,
    });

    // Step 2: Explicitly dispatch the agent into the now-existing room.
    const dispatchClient = new AgentDispatchClient(
      env.livekitUrl,
      env.livekitApiKey,
      env.livekitApiSecret,
    );
    await dispatchClient.createDispatch(roomName, agentName, { metadata });

    // Step 3: Build participant token for the Flutter client.
    const token = new AccessToken(env.livekitApiKey, env.livekitApiSecret, {
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
    token.roomConfig = new RoomConfiguration({
      agents: [new RoomAgentDispatch({ agentName })],
    });

    const jwt = await token.toJwt();

    res.json({
      success: true,
      data: {
        token: jwt,
        url: env.livekitUrl,
      },
    });
  } catch (err) {
    next(err);
  }
};
