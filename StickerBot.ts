import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SlashCommandBuilder } from "@discordjs/builders";
import { ApplicationCommandOptionChoiceData, AutocompleteInteraction, Client, CommandInteraction, Intents, MessageEmbed } from "discord.js";
import Fuse from "fuse.js";
import LRUCache from "lru-cache";
import { BotInterface } from "../../BotInterface";
import { getPath, readYamlConfig } from "../../ConfigUtils";
import { StickerConfig } from "./StickerConfig";
import { Sticker, StickerInfo } from "./StickerTypes";

export class StickerBot implements BotInterface {
    intents: number[];
    slashCommands: [SlashCommandBuilder];
    private slashSticker: SlashCommandBuilder;
    private config!: StickerConfig;
    private stickers: StickerInfo;
    private stickerSearch: Sticker[];
    private cache!: LRUCache<string, ApplicationCommandOptionChoiceData[]>;
    private fuse!: Fuse<Sticker>;
    private readonly botPath: string;
    private static readonly OPT_STICKER_TEXT = "text";

    constructor() {
        this.intents = [Intents.FLAGS.GUILDS];
        this.slashSticker = new SlashCommandBuilder()
            .setName("sticker")
            .setDescription("Posts a sticker.")
            .addStringOption(option =>
                option
                    .setName(StickerBot.OPT_STICKER_TEXT)
                    .setDescription("The text associated with the sticker.")
                    .setAutocomplete(true)
                    .setRequired(true)
            ) as SlashCommandBuilder;
        this.slashCommands = [this.slashSticker];
        this.stickers = {};
        this.stickerSearch = [];
        this.botPath = getPath(import.meta.url, null);
    }

    async processSlashCommand(interaction: CommandInteraction): Promise<void> {
        if (interaction.commandName === this.slashSticker.name) {
            await this.handleSlashSticker(interaction);
        }
    }

    async useClient(client: Client): Promise<void> {
        client.on("interactionCreate", (interaction) => {
            if (interaction.user.id === client.user!.id) {
                return;
            }

            if (interaction.isAutocomplete()) {
                this.handleAutoComplete(interaction);
            }
        });
    }

    async handleSlashSticker(interaction: CommandInteraction): Promise<void> {
        console.log(`[StickerBot] Got command interaction: ${interaction}`);
        try {
            const text = interaction.options.getString(StickerBot.OPT_STICKER_TEXT, true);
            if (!(text in this.stickers)) {
                const description = `Sticker with text ${text} not found.`;
                console.error(`[StickerBot] ${description}`);

                const notFoundEmbed = new MessageEmbed()
                    .setTitle("Sticker not found")
                    .setDescription(description)
                    .setColor(0xFF0000);

                await interaction.reply({
                    embeds: [notFoundEmbed],
                    ephemeral: true
                });

                return;
            }

            await interaction.deferReply();
            if (this.config.uploadImage) {
                const stickerPath = join(this.botPath, this.stickers[text].filePath);
                console.log(`[StickerBot] Uploading file path: ${stickerPath}`);
                await interaction.editReply({
                    files: [stickerPath]
                });
            } else {
                const url = this.stickers[text].url;
                console.log(`[StickerBot] Responding with url: ${url}`);
                await interaction.editReply(url);
            }
        } catch (error) {
            const description = `Error while getting sticker with text ${error}:\n${error}`;
            console.error(`[StickerBot] ${description}`);

            const errorEmbed = new MessageEmbed()
                .setTitle("Error")
                .setDescription(description)
                .setColor(0xFF0000);

            if (interaction.isRepliable()) {
                if (interaction.deferred) {
                    await interaction.editReply({
                        embeds: [errorEmbed]
                    });
                } else {
                    await interaction.reply({
                        embeds: [errorEmbed],
                        ephemeral: true
                    });
                }
            }
        }
    }

    async handleAutoComplete(interaction: AutocompleteInteraction): Promise<void> {
        const query = interaction.options.getString(StickerBot.OPT_STICKER_TEXT);
        // console.log(`[StickerBot] Got interaction ${interaction} with query: ${query}`);
        try {
            if (query === null) {
                return;
            }

            let respondArr: ApplicationCommandOptionChoiceData[];
            const cacheResult = this.cache.get(query);
            if (cacheResult !== undefined) {
                respondArr = cacheResult;
            } else {
                const results = this.fuse.search(query, { limit: this.config.fuse.limit });
                respondArr = new Array(results.length);
                for (let index = 0; index < results.length; index++) {
                    const result = results[index];
                    const value = result.item.text;
                    let name = result.item.text;
                    if (result.score !== undefined) {
                        name += ` | score: ${result.score}`;
                    }

                    respondArr[index] = { name: name, value: value };
                }
            }

            interaction.respond(respondArr);
        } catch (error) {
            console.log(`[StickerBot] Got error with query ${query}:\n${error}`);
        }
    }

    async init(): Promise<string | null> {
        const configPath = getPath(import.meta.url, "config.yaml");
        try {
            this.config = await readYamlConfig<StickerConfig>(configPath);

            const stickerInfoPath = getPath(import.meta.url, this.config.stickerInfoPath);
            console.log(`[StickerBot] Attempting to read ${stickerInfoPath}...`);
            this.stickers = JSON.parse(readFileSync(stickerInfoPath, "utf-8"));
            for (const text in this.stickers) {
                this.stickerSearch.push(this.stickers[text]);
            }

            let keys = [{
                name: "text",
                weight: this.config.fuse.textWeight
            }];
            if (this.config.fuse.metadata !== null && this.config.fuse.metadata.length > 0) {
                keys = keys.concat(this.config.fuse.metadata);
            }

            this.fuse = new Fuse(this.stickerSearch, {
                keys: keys,
                isCaseSensitive: false,
                shouldSort: true,
                includeScore: this.config.fuse.score
            });

            this.cache = new LRUCache({
                max: this.config.cacheMax
            });
        } catch (error) {
            const errMsg = `[StickerBot] Unable to read config or sticker info: ${error}`;
            console.error(errMsg);
            return errMsg;
        }

        return null;
    }
}
