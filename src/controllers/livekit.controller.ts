import { Response, NextFunction } from 'express';
import { AccessToken, RoomAgentDispatch, RoomConfiguration } from 'livekit-server-sdk';
import { env } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';

export const generateToken = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ success: false, message: 'Not authenticated' });
      return;
    }

    const patientId = user.userId;
    const rawJwt = req.headers.authorization!.split(' ')[1];

    const roomName = `voice-${patientId}-${Math.floor(Date.now() / 1000)}`;
    const identity = `patient-${patientId}`;

    const token = new AccessToken(env.livekitApiKey, env.livekitApiSecret, {
      identity,
      ttl: '1h',
    });

    token.metadata = rawJwt;

    token.addGrant({
      roomJoin: true,
      roomCreate: true,
      canPublish: true,
      canSubscribe: true,
      room: roomName,
    });

    token.roomConfig = new RoomConfiguration({
      agents: [new RoomAgentDispatch({ agentName: 'murshid-hospital-agent' })],
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
