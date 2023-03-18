import { autoKick } from './autoKick';
import { autoWhen } from './autoWhen';
import { joinMessages, leaveMessages } from './joinLeave';
import { memberCounter } from './memberCounter';
import { addRole, removeRole } from './reactionRoles';

export default [addRole, autoKick, autoWhen, joinMessages, leaveMessages, memberCounter, removeRole];
