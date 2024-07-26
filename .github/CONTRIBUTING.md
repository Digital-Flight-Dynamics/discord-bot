## How to Contribute

### Requirements

-   Use straight-forward command names
-   Write your commands with readability in mind.
-   Test your code thoroughly before submitting a pull request

### Editing a Command
Just open the file for the command you want to edit in `src/commands/<category>`, and make your desired changes.
### Creating a Command
1. Create a new typescript file in the relevant category in `src/commands/`, and name it as your command name. `examplecommand.ts`
2. You may use the template found below to help with creating the command.
3. Import your command in `src/commands/index.ts` and add it to the `commands` array at the end of the file. Please note that the order you put in your command in the array will affect the order it will be displayed in the `.help` command. 
#### Command Template
```ts
import { CommandDefinition } from '../index';
import { CommandCategories } from '../constants';

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
1. Add the category to the `CommandCategories` enum in `src/commands/constants.ts`. `MY_CATEGORY = 'My Category',`
2. Open the file for the `.help` command found at `src/commands/general/help.ts`. Find the embed called `rootEmbed` and add a new field. `{ name: 'My Category', value: 'Describe your category' },`
3. Lastly, create a new folder in `src/commands/`, and name it based on your category in lower case. `src/commands/my category/`
