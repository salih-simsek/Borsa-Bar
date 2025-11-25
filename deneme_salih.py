import pandas as pd

"""
yüksek-düşük kar sütunu ekle
yüksek düşük karlara göre fonksiyonları doldur
"""

df = pd.DataFrame(columns=[
    "name",
    "current_price",
    "min_price",
    "max_price",
    "stock"
])

df = df.astype({
    "name": "string",
    "current_price": "int64",
    "min_price": "int64",
    "max_price": "int64",
    "stock": "int64"
})

def add_drink_in_menu(name,current_price,min_price,max_price,stock):
    if name in df["name"].tolist():
        print("Already on the menu")
        return 0
    elif stock < 1:
        print("Stock is not enough to add on the menu")
        return 0
    else:
        df.loc[len(df)] = [name,current_price,min_price,max_price,stock]
        return print("Successfuly added")

def delete_drink_from_menu(name):
    if name in df["name"].tolist():
        print("Item trying to delete is not on the menu.")
        return 0   
    else:
        df.drop(df["name"] == name)
        return print("Successfuly deleted.")

def order(name,amount):
    if name not in df["name"].tolist():
        print("Not on menu")
        return 0
    elif amount > df.loc[df.name == name, "stock"].item():
        print("Stock is not enough to order this drink.")
    else:
        """
        içeceğin stoğunu talep edilen kadar azalt
        stok durumu kontrolü yap =0 ise stok bitti uyarısı ver"""
        return 0



