import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MainComponent } from './main/main.component';
import { SanitizeUrlModule } from './sanitizeurl/sanitizeurl.module';
import { ImageComponent } from './image/image.component';

import { MatButtonModule } from '@angular/material/button';

@NgModule({
  declarations: [
      AppComponent,
      MainComponent,
      ImageComponent
  ],
    imports: [
        BrowserModule,
        AppRoutingModule,
        SanitizeUrlModule,
        MatButtonModule,
    ],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule { }
