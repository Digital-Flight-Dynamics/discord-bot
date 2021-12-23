# Digital Flight Dynamics Discord Bot

[![Discord](https://img.shields.io/discord/808790838163406848.svg?label=&logo=discord&logoColor=ffffff&color=7289DA&labelColor=7289DA)](https://discord.gg/REGJgP4gZd)

Official Repository of the Digital Flight Dynamics discord bot.

## How to Contribute

### Requirements

-   Use straight-forward command names
-   Write your commands with readability in mind.
-   Test your code thoroughly before submitting a pull request

#### Command Template

```ts
import { CommandCategories, CommandDefinition } from '../index';

export const name: CommandDefinition = {
    names: ['name'], // The command only requires 1 name, but it can have multiple
    description: 'Describe your command',
    category: CommandCategories.GENERAL, // Put whatever category best suites the command
    permissions: [], // Not required; If the command needs specific permissions, add them here. A list of permission flags can be found at https://discord.js.org/#/docs/main/stable/class/Permissions?scrollTo=s-FLAGS
    execute: async (message, args) => {
        await message.channel.send('Command works!');
    },
};
```
