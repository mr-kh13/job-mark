import '@/utils/zod-config';
import { listenForMessages } from './message-handler';

export default defineBackground(() => {
  listenForMessages();
});
