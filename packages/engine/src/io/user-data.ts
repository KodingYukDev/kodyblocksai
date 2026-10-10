/** UserData (scratch-vm io/userData.js). */
import type { IUserData } from "../types/io";

export function createUserData(): IUserData {
  let username = "";
  return {
    getUsername: () => username,
    postData: (data) => {
      username = data.username;
    },
  };
}
