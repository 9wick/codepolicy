type UserRecord = {
  id: string;
  name: string;
  email: string;
};

const PREMIUM_PLAN = 'premium';
const PREMIUM_PLAN_LABEL = 'premium';

function buildPremiumGreeting(name: string): string {
  return `Welcome back, ${name}. Your plan is ${PREMIUM_PLAN}.`;
}

function createPremiumGreeting(name: string): string {
  return `Welcome back, ${name}. Your plan is ${PREMIUM_PLAN_LABEL}.`;
}

export async function getUserProfile(id: string): Promise<UserRecord> {
  void id;

  return {
    id,
    name: 'Ada Lovelace',
    email: 'ada@example.com',
  };
}

export function buildWelcomeMessage(name: string): string {
  const first = buildPremiumGreeting(name);
  const second = createPremiumGreeting(name);
  return `${first} ${second}`;
}
