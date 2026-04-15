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

    const userId   = user.userId;
    const roleName = user.roleName;
    const rawJwt   = req.headers.authorization!.split(' ')[1];

    const isDoctor  = roleName === 'doctor';
    const identity  = isDoctor ? `doctor-${userId}` : `patient-${userId}`;
    const agentName = isDoctor ? 'murshid-doctor-agent' : 'murshid-hospital-agent';
    const roomName  = `voice-${userId}-${Math.floor(Date.now() / 1000)}`;

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
