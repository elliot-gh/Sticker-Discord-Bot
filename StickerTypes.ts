/**
 * The main sticker json file is basically an object of many objects, with key of sticker text
 * and value of type Sticker.
 */
export type StickerInfo = {
    [stickerText: string]: Sticker
};

/**
 * Each sticker entry should have text (what a user searches for), a valid file path if using the uploadImage setting,
 * or a valid url if not using the uploadImage setting. metadata can contain anything and is used for autocomplete.
 * More info in config.example.yaml.
 */
export type Sticker = {
    text: string,
    filePath: string,
    url: string,
    metadata: any
}
