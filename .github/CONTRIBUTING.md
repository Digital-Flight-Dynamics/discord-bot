## How to Contribute

### Requirements

- Use straight-forward command names
- Write your commands with readability in mind.
- Test your code thoroughly before submitting a pull request
- Ensure all code passes linting and formatting checks

## Code Quality Standards

This project enforces code quality through automated linting and formatting.

### Before Committing

Pre-commit hooks will automatically check your code. If checks fail:

1. **ESLint errors**: Run `npm run lint` to see issues, then fix manually or use `npm run lint:fix` for auto-fixable issues
2. **Prettier formatting**: Run `npm run format` to auto-fix formatting
3. **Markdown issues**: Run `npm run markdown:fix` to auto-fix most issues

### Manual Checks

Run all checks locally before pushing:

```bash
npm run check:all
```

### Available Scripts

- `npm run lint` - Check TypeScript for code quality issues
- `npm run lint:fix` - Auto-fix ESLint issues where possible
- `npm run format` - Auto-format all code with Prettier
- `npm run format:check` - Check if code is formatted correctly
- `npm run markdown:lint` - Check markdown files
- `npm run markdown:fix` - Auto-fix markdown issues
- `npm run check:all` - Run all checks at once

### Editing a Command

Just open the file for the command you want to edit in `src/commands/<category>`, and make your desired changes.

### Creating a Command

1. Create a new typescript file in the relevant category in `src/commands/`, and name it as your command name. `examplecommand.ts`
2. You may use the template found below to help with creating the command.
3. Import your command in `src/commands/index.ts` and add it to the `commands` array at the end of the file. Please note that the order you put in your command in the array will affect the order it will be displayed in the `.help` command.

#### Command Template

```ts
import { CommandCategories, CommandDefinition } from '../index';

export const name: CommandDefinition = {
    names: ['name'], // The command only requires 1 name, but it can have multiple
    description: 'Describe your command', // This description will be displayed with the .help command
    category: CommandCategories.GENERAL, // Put whatever category best suites the command
    permissions: [], // Not required; If the command needs specific permissions, add them here. A list of permission flags can be found at https://discord.js.org/#/docs/main/stable/class/Permissions?scrollTo=s-FLAGS
    execute: async (message, args) => {
        await message.channel.send('Command works!').catch((err) => console.error(err));
    },
};
```

### Creating a Command Category

If the command you want to create doesn't fit any of the existing categories, you'll need to create a new one.

1. Add the category to the `CommandCategories` enum in `src/commands/index.ts`. `MY_CATEGORY = 'My Category',`
2. Open the file for the `.help` command found at `src/commands/general/help.ts`. Find the embed called `rootEmbed` and add a new field. `{ name: 'My Category', value: 'Describe your category' },`
3. Lastly, create a new folder in `src/commands/`, and name it based on your category in lower case. `src/commands/my category/`
